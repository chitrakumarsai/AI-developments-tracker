import "server-only";

import { getServerClient } from "../supabase/server";
import type { ItemRow } from "../supabase/types";

export const DEFAULT_FEED_LIMIT = 50;
export const MAX_FEED_LIMIT = 100;

/**
 * Recent items for the feed, newest first. Optionally filtered to a single
 * `items.category` (used by the section tabs); pass null/undefined for all
 * categories. Phase 1 sort is recency only; relevance-aware ranking arrives in
 * subphase 1.4.
 */
export async function getRecentItems(
  limit: number = DEFAULT_FEED_LIMIT,
  category?: string | null,
): Promise<ItemRow[]> {
  const client = getServerClient();
  let query = client.from("items").select("*");
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load items: ${error.message}`);
  }
  // Unchecked cast: the untyped client returns any[]. Replace with generated
  // types once `supabase gen types typescript --local` is in the toolchain.
  return (data ?? []) as unknown as ItemRow[];
}
