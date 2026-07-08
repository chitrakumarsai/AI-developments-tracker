import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { IngestionType, SourceRow } from "../supabase/types";
import { sanitizeText } from "../ingestion/sanitize";

/** Catalog metadata for a source added straight from the management UI (2.4.2). */
export type NewSource = {
  name: string;
  category: string;
  url: string;
  ingestionType: IngestionType;
  tags: string[];
};

/** A catalog row annotated with how many items it has ingested. */
export type SourceWithCount = SourceRow & { itemCount: number };

/** The columns the catalog list reads — kept explicit so the shape is stable. */
const SOURCE_COLUMNS =
  "id, name, category, url, ingestion_type, status, priority, tags, notes, added_on, last_fetched, refresh_interval";

/**
 * Insert an `active` source into the live catalog and return its id. All
 * user-authored text is sanitized (untrusted input, §12.7); the URL is validated
 * (SSRF + feed-parse) by the caller BEFORE this write, so this stays a pure DB
 * insert. Injectable client for unit testing. Throws on DB error.
 *
 * Mirrors `promoteCandidate`'s insert so both add-paths write the same shape.
 */
export async function createSource(
  { name, category, url, ingestionType, tags }: NewSource,
  client: SupabaseClient = getServerClient(),
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("sources")
    .insert({
      name: sanitizeText(name),
      category: sanitizeText(category),
      url,
      ingestion_type: ingestionType,
      status: "active",
      tags: tags.map((tag) => sanitizeText(tag)),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create source: ${error?.message ?? "no row returned"}`);
  }
  return { id: (data as { id: string }).id };
}

/**
 * The full catalog, each row annotated with its ingested-item count, ordered by
 * priority then recency. Item counts are tallied in memory from a single
 * `source_id`-only scan of `items` — one round-trip, no N+1 per-source counts.
 * (At the current catalog size this is cheap; a grouped-count RPC is the scale
 * path if `items` grows large.) Injectable client for testing. Throws on DB error.
 */
export async function listSourcesWithCounts(
  client: SupabaseClient = getServerClient(),
): Promise<SourceWithCount[]> {
  const { data: sourceData, error: sourceError } = await client
    .from("sources")
    .select(SOURCE_COLUMNS)
    .order("priority", { ascending: false })
    .order("added_on", { ascending: false });

  if (sourceError) {
    throw new Error(`Failed to load sources: ${sourceError.message}`);
  }

  const sources = (sourceData ?? []) as SourceRow[];
  if (sources.length === 0) return [];

  const { data: itemData, error: itemError } = await client
    .from("items")
    .select("source_id");

  if (itemError) {
    throw new Error(`Failed to count items: ${itemError.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of (itemData ?? []) as Array<{ source_id: string }>) {
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }

  return sources.map((source) => ({ ...source, itemCount: counts.get(source.id) ?? 0 }));
}
