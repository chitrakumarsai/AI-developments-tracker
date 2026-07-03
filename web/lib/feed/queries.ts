import "server-only";

import { getServerClient } from "../supabase/server";
import type { ItemRow } from "../supabase/types";
import { rankItems } from "../ranking/score";

export const DEFAULT_FEED_LIMIT = 50;
export const MAX_FEED_LIMIT = 100;

/**
 * Finite-first UX (app-feedback-v1): show a small, non-intimidating batch per
 * section by default, and let the reader ask for more in steps rather than an
 * endless scroll.
 */
export const INITIAL_FEED_LIMIT = 20;
export const FEED_PAGE_STEP = 20;

const MS_PER_DAY = 86_400_000;

/**
 * Feed sort order.
 * - `relevant` (default) = recency + per-source-normalized popularity (§1.4).
 * - `recent` = newest first.
 * - `metric` = most stars/likes first (Repos/Models override).
 */
export type FeedSort = "relevant" | "recent" | "metric";

/** Recency window the reader can pick; scopes and shapes ranking (app-feedback-v2). */
export type FeedWindow = "today" | "week" | "month" | "all";

/** Default window: one month of history, per the user's follow-the-field cadence. */
export const DEFAULT_WINDOW: FeedWindow = "month";

/** Window → day span; `null` means unbounded ("all"). */
export const WINDOW_DAYS: Record<FeedWindow, number | null> = {
  today: 1,
  week: 7,
  month: 30,
  all: null,
};

/** Fallback decay span (days) used when ranking with the unbounded window. */
const UNBOUNDED_DECAY_DAYS = 365;

/**
 * Candidate pool size for relevance ranking. We pull the most-recent N within
 * the window, then score/interleave in JS (cross-source normalization can't be
 * expressed in a single SQL order-by). Bounded so the page stays fast.
 */
const RANK_POOL_SIZE = 300;

export type FeedQuery = {
  /** DB category to filter to; null/undefined = all categories. */
  category?: string | null;
  sort?: FeedSort;
  window?: FeedWindow;
  limit?: number;
};

/**
 * Load feed items. Default order is relevance (recency + popularity), which
 * interleaves every source into one ranked list — the fix for "I have to scroll
 * through all arXiv before I reach GitHub". `recent`/`metric` remain as explicit
 * overrides. The `window` bounds and shapes ranking (default: one month).
 * Resilient callers should catch — a Supabase failure throws here.
 */
export async function getFeedItems({
  category,
  sort = "relevant",
  window = DEFAULT_WINDOW,
  limit = INITIAL_FEED_LIMIT,
}: FeedQuery = {}): Promise<ItemRow[]> {
  const client = getServerClient();
  const now = Date.now();
  const windowDays = WINDOW_DAYS[window] ?? null;

  // Embed the source name so the card can label the item's platform accurately.
  let query = client.from("items").select("*, source:sources(name)");
  if (category) {
    query = query.eq("category", category);
  }
  if (windowDays != null) {
    const since = new Date(now - windowDays * MS_PER_DAY).toISOString();
    query = query.gte("published_at", since);
  }

  if (sort === "relevant") {
    const { data, error } = await query
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(RANK_POOL_SIZE);
    if (error) {
      throw new Error(`Failed to load items: ${error.message}`);
    }
    const pool = (data ?? []) as unknown as ItemRow[];
    const decayDays = windowDays ?? UNBOUNDED_DECAY_DAYS;
    return rankItems(pool, now, decayDays).slice(0, limit);
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
