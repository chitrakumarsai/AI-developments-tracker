import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { IngestionType, SourceRow, SourceStatus } from "../supabase/types";
import { sanitizeText } from "../ingestion/sanitize";

/** Priority is a bounded weight; clamp so a stray API value can't skew ranking. */
export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 100;

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
 * Change a source's lifecycle state (2.4.2): `active ↔ paused` (pause keeps the
 * source but scheduled ingestion skips it) or `archived` (soft-delete; restore =
 * back to `active`). Owner-gated at the route; injectable client for testing.
 * Throws on DB error.
 */
export async function setSourceStatus(
  id: string,
  status: SourceStatus,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client.from("sources").update({ status }).eq("id", id);
  if (error) {
    throw new Error(`Failed to update source status: ${error.message}`);
  }
}

/**
 * Re-weight a source's ranking `priority`. The value is clamped to
 * `[MIN_PRIORITY, MAX_PRIORITY]` and rounded so a stray/hostile API number can't
 * skew the feed. Throws on DB error.
 */
export async function setSourcePriority(
  id: string,
  priority: number,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const clamped = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(priority)));
  const { error } = await client
    .from("sources")
    .update({ priority: clamped })
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to update source priority: ${error.message}`);
  }
}

/** Editable catalog metadata (2.4.2). `url` is intentionally NOT editable here. */
export type SourceMeta = {
  name: string;
  category: string;
  tags: string[];
};

/**
 * Edit a source's display metadata (`name`, `category`, `tags`). All values are
 * sanitized (untrusted-input hygiene, §12.7) before the write. The `url` is
 * deliberately out of scope — changing it would require re-running the SSRF/feed
 * validation, so it stays immutable in this slice. Throws on DB error.
 */
export async function updateSourceMeta(
  id: string,
  { name, category, tags }: SourceMeta,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client
    .from("sources")
    .update({
      name: sanitizeText(name),
      category: sanitizeText(category),
      tags: tags.map((tag) => sanitizeText(tag)),
    })
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to update source: ${error.message}`);
  }
}

/**
 * The full catalog, each row annotated with its ingested-item count, ordered by
 * priority then recency, with archived sources partitioned to the bottom (they
 * recede but stay listed so the owner can restore them). Item counts are tallied
 * in memory from a single `source_id`-only scan of `items` — one round-trip, no
 * N+1 per-source counts. (At the current catalog size this is cheap; a grouped-
 * count RPC is the scale path if `items` grows large.) Injectable client for
 * testing. Throws on DB error.
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

  const withCounts = sources.map((source) => ({
    ...source,
    itemCount: counts.get(source.id) ?? 0,
  }));

  // Keep the DB priority/recency order but sink archived sources to the bottom.
  const live = withCounts.filter((s) => s.status !== "archived");
  const archived = withCounts.filter((s) => s.status === "archived");
  return [...live, ...archived];
}
