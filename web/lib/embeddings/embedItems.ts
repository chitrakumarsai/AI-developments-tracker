import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { embed as defaultEmbed, type Embed } from "../llm/openai";
import { itemEmbedInput } from "./itemText";

/** Minimal item shape needed to build + store an embedding. */
export type EmbeddableRow = {
  id: string;
  title?: string | null;
  summary?: string | null;
};

export type EmbedItemsResult = {
  embedded: number;
  warnings: string[];
};

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Embed a batch of items and store each vector on its row. Best-effort: a
 * missing key or API failure returns a warning rather than throwing, so callers
 * on the ingest hot path never break because embeddings are down (the backfill
 * route catches stragglers later). Items with no embeddable text are skipped.
 *
 * pgvector accepts its text form `[0.1,0.2,…]` — exactly `JSON.stringify(vector)`
 * — so we send the array serialized to that string. Injectable `embedFn` for
 * tests (no network).
 */
export async function embedItems(
  client: SupabaseClient,
  items: readonly EmbeddableRow[],
  embedFn: Embed = defaultEmbed,
): Promise<EmbedItemsResult> {
  const targets = items
    .map((item) => ({ id: item.id, text: itemEmbedInput(item) }))
    .filter((row) => row.text.length > 0);
  if (targets.length === 0) return { embedded: 0, warnings: [] };

  let vectors: number[][];
  try {
    vectors = await embedFn(targets.map((row) => row.text));
  } catch (error) {
    return { embedded: 0, warnings: [`Embedding failed: ${errMessage(error)}`] };
  }
  if (vectors.length !== targets.length) {
    return { embedded: 0, warnings: ["Embedding count did not match item count."] };
  }

  const results = await Promise.all(
    targets.map((row, i) =>
      client
        .from("items")
        .update({ embedding: JSON.stringify(vectors[i]) })
        .eq("id", row.id),
    ),
  );
  const failed = results.filter((r) => r.error).length;
  const warnings = failed > 0 ? [`Could not store ${failed} embedding(s).`] : [];
  return { embedded: targets.length - failed, warnings };
}
