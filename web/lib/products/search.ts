import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Embed, Complete } from "../llm/openai";
import { rerankItems, type RerankCandidate } from "./rerank";

/** Candidate pool size retrieved by vector search before the LLM rerank. */
export const RETRIEVE_COUNT = 60;

/** A single snapshot row: which item, at what display rank. */
export type SnapshotItem = { id: string; rank: number; score: number | null };

export type Snapshot = {
  /** The prompt's embedding, stored on the product for later re-ranking. */
  embedding: number[];
  items: SnapshotItem[];
};

export type SnapshotDeps = {
  embed: Embed;
  complete: Complete;
  client: SupabaseClient;
  retrieveCount?: number;
};

/**
 * Build a prompt-view's materialized snapshot: embed the prompt, retrieve the
 * nearest items via the `match_items` pgvector RPC, then LLM-rerank that pool to
 * the final ordered set. Pure orchestration over injected deps (no direct
 * network), so it's unit-testable with fakes. Throws if embedding fails or the
 * RPC errors; the caller decides how to surface that.
 */
export async function buildSnapshot(
  prompt: string,
  { embed, complete, client, retrieveCount = RETRIEVE_COUNT }: SnapshotDeps,
): Promise<Snapshot> {
  const vectors = await embed([prompt]);
  const embedding = vectors[0];
  if (!embedding) throw new Error("Failed to embed the prompt.");

  const { data, error } = await client.rpc("match_items", {
    query_embedding: JSON.stringify(embedding),
    match_count: retrieveCount,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);

  const candidates = ((data ?? []) as Array<{
    id: string;
    title: string | null;
    summary: string | null;
  }>).map<RerankCandidate>((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
  }));

  const orderedIds = await rerankItems(prompt, candidates, complete);
  const items: SnapshotItem[] = orderedIds.map((id, index) => ({
    id,
    rank: index,
    score: null,
  }));
  return { embedding, items };
}
