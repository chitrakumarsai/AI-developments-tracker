import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import { embedItems, type EmbeddableRow } from "./embedItems";
import type { Embed } from "../llm/openai";

/** Items embedded per backfill call — bounded so one request stays inside the
 * function timeout and the embeddings batch stays a single API call. */
export const BACKFILL_BATCH = 200;

export type BackfillResult = {
  scanned: number;
  embedded: number;
  warnings: string[];
};

/**
 * Embed a batch of items that have no embedding yet (one-off catch-up for rows
 * ingested before embeddings existed, or when embed-on-ingest was down). Bounded
 * to `limit` rows per call; re-run until `scanned` is 0. Uses the service client
 * (bypasses RLS to update the shared corpus). Injectable client + embedder for
 * tests. Throws only on the scan read; embedding failures come back as warnings.
 */
export async function backfillItemEmbeddings(
  client: SupabaseClient = getServerClient(),
  limit: number = BACKFILL_BATCH,
  embedFn?: Embed,
): Promise<BackfillResult> {
  const { data, error } = await client
    .from("items")
    .select("id, title, summary")
    .is("embedding", null)
    .limit(limit);
  if (error) throw new Error(`Backfill scan failed: ${error.message}`);

  const rows = (data ?? []) as EmbeddableRow[];
  if (rows.length === 0) return { scanned: 0, embedded: 0, warnings: [] };

  const { embedded, warnings } = await embedItems(client, rows, embedFn);
  return { scanned: rows.length, embedded, warnings };
}
