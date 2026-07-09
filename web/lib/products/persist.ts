import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItemRow } from "../supabase/types";

/**
 * A saved prompt-view (v4 Slice B). The user authors a `prompt` + `title`; the
 * matched items are a materialized snapshot in `product_items`. `itemCount` is
 * the snapshot size so the list can show "12 items" without loading them.
 */
export type ProductSummary = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  itemCount: number;
};

/** A product plus its materialized item snapshot, ordered by stored rank. */
export type ProductWithItems = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  items: ItemRow[];
};

export type CreateProductInput = {
  title: string;
  prompt: string;
  /** The prompt's embedding (stored for later re-ranking); optional. */
  embedding?: number[];
};

/** A ranked snapshot row to persist for a product. */
export type SnapshotRow = { id: string; rank: number; score: number | null };

/**
 * Create a saved prompt-view for the signed-in user. `user_id` is set explicitly
 * so RLS's WITH CHECK passes. The embedding (when provided) is stored as the
 * pgvector text form. The item snapshot is written separately via
 * `replaceSnapshot`. Returns the new id. Throws on DB error.
 */
export async function createProduct(
  { title, prompt, embedding }: CreateProductInput,
  userId: string,
  client: SupabaseClient,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("products")
    .insert({
      user_id: userId,
      title,
      prompt,
      ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create product: ${error?.message ?? "no row returned"}`);
  }
  return { id: (data as { id: string }).id };
}

/**
 * Replace a product's materialized snapshot: clear the old `product_items` and
 * insert the new ranked rows (skipped when empty). Used by both create and
 * refresh. RLS on `product_items` gates writes through the parent product, so a
 * user can only touch their own. Throws on DB error.
 */
export async function replaceSnapshot(
  productId: string,
  rows: readonly SnapshotRow[],
  client: SupabaseClient,
): Promise<void> {
  const { error: delError } = await client
    .from("product_items")
    .delete()
    .eq("product_id", productId);
  if (delError) {
    throw new Error(`Failed to clear snapshot: ${delError.message}`);
  }
  if (rows.length === 0) return;

  const { error: insError } = await client.from("product_items").insert(
    rows.map((row) => ({
      product_id: productId,
      item_id: row.id,
      rank: row.rank,
      score: row.score,
    })),
  );
  if (insError) {
    throw new Error(`Failed to write snapshot: ${insError.message}`);
  }
}

/**
 * List the user's saved prompt-views, newest first, each annotated with its
 * snapshot size. Counts are tallied in memory from a single `product_id`-only
 * scan of `product_items` (one round-trip, no N+1). RLS scopes to the owner; the
 * explicit `user_id` filter keeps intent clear. Throws on DB error.
 */
export async function listProducts(
  userId: string,
  client: SupabaseClient,
): Promise<ProductSummary[]> {
  const { data, error } = await client
    .from("products")
    .select("id, title, prompt, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    prompt: string;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const { data: linkData, error: linkError } = await client
    .from("product_items")
    .select("product_id")
    .in(
      "product_id",
      rows.map((r) => r.id),
    );
  if (linkError) {
    throw new Error(`Failed to count product items: ${linkError.message}`);
  }
  const counts = new Map<string, number>();
  for (const row of (linkData ?? []) as Array<{ product_id: string }>) {
    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    createdAt: r.created_at,
    itemCount: counts.get(r.id) ?? 0,
  }));
}

/**
 * A product's prompt (for the refresh path). Owner-scoped; null when not found.
 * Throws on DB error other than "no rows".
 */
export async function getProductPrompt(
  id: string,
  userId: string,
  client: SupabaseClient,
): Promise<{ title: string; prompt: string } | null> {
  const { data, error } = await client
    .from("products")
    .select("title, prompt")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  return (data as { title: string; prompt: string } | null) ?? null;
}

/**
 * A product plus its materialized item snapshot, ordered by stored rank. Two
 * reads (links, then the items) keep it a simple join in memory. Owner-scoped;
 * null when the product isn't the user's. Throws on DB error.
 */
export async function getProductWithItems(
  id: string,
  userId: string,
  client: SupabaseClient,
): Promise<ProductWithItems | null> {
  const { data: productData, error: productError } = await client
    .from("products")
    .select("id, title, prompt, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (productError) {
    throw new Error(`Failed to load product: ${productError.message}`);
  }
  if (!productData) return null;
  const product = productData as {
    id: string;
    title: string;
    prompt: string;
    created_at: string;
  };

  const { data: linkData, error: linkError } = await client
    .from("product_items")
    .select("item_id, rank")
    .eq("product_id", id)
    .order("rank", { ascending: true });
  if (linkError) {
    throw new Error(`Failed to load snapshot: ${linkError.message}`);
  }
  const links = (linkData ?? []) as Array<{ item_id: string; rank: number }>;
  if (links.length === 0) {
    return { ...product, createdAt: product.created_at, items: [] };
  }

  const { data: itemData, error: itemError } = await client
    .from("items")
    .select("*, source:sources(name)")
    .in(
      "id",
      links.map((l) => l.item_id),
    );
  if (itemError) {
    throw new Error(`Failed to load snapshot items: ${itemError.message}`);
  }
  const byId = new Map(
    ((itemData ?? []) as unknown as ItemRow[]).map((item) => [item.id, item]),
  );
  const items = links
    .map((l) => byId.get(l.item_id))
    .filter((item): item is ItemRow => Boolean(item));

  return { ...product, createdAt: product.created_at, items };
}

/**
 * Delete a saved prompt-view (its snapshot cascades via the FK). RLS + the
 * explicit `user_id` filter ensure a user can only delete their own. Throws on
 * DB error.
 */
export async function deleteProduct(
  id: string,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from("products")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }
}
