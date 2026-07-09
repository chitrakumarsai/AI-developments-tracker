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
};

/**
 * Create a saved prompt-view for the signed-in user. `user_id` is set explicitly
 * so RLS's WITH CHECK passes. The item snapshot is populated later by the refresh
 * path (semantic search), so a fresh product starts empty. Returns the new id.
 * Throws on DB error.
 */
export async function createProduct(
  { title, prompt }: CreateProductInput,
  userId: string,
  client: SupabaseClient,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("products")
    .insert({ user_id: userId, title, prompt })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create product: ${error?.message ?? "no row returned"}`);
  }
  return { id: (data as { id: string }).id };
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
