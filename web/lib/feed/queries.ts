import "server-only";

import { getServerClient } from "../supabase/server";
import type { ItemRow } from "../supabase/types";

export const DEFAULT_FEED_LIMIT = 50;
export const MAX_FEED_LIMIT = 100;

/**
 * Finite-first UX (app-feedback-v1): show a small, non-intimidating batch per
 * section by default, and let the reader ask for more in steps rather than an
 * endless scroll.
 */
export const INITIAL_FEED_LIMIT = 20;
export const FEED_PAGE_STEP = 20;

/** Feed sort order. `recent` = newest first; `metric` = most stars/likes first. */
export type FeedSort = "recent" | "metric";

/**
 * Recent items for the feed. Optionally filtered to a single `items.category`
 * (used by the section tabs); pass null/undefined for all categories. `sort`
 * chooses recency (default) or popularity — the "Top-starred" toggle on the
 * Repos/Models sections. Relevance-aware ranking arrives in subphase 1.4.
 */
export async function getRecentItems(
  limit: number = DEFAULT_FEED_LIMIT,
  category?: string | null,
  sort: FeedSort = "recent",
): Promise<ItemRow[]> {
  const client = getServerClient();
  // Embed the source name so the card can label the item's platform (Hacker
  // News, Reddit, GitHub, …) accurately — the source, not the outbound link.
  let query = client.from("items").select("*, source:sources(name)");
  if (category) {
    query = query.eq("category", category);
  }
  query =
    sort === "metric"
      ? query.order("metric", { ascending: false, nullsFirst: false })
      : query.order("published_at", { ascending: false, nullsFirst: false });
  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Failed to load items: ${error.message}`);
  }
  // Unchecked cast: the untyped client returns any[]. Replace with generated
  // types once `supabase gen types typescript --local` is in the toolchain.
  return (data ?? []) as unknown as ItemRow[];
}
