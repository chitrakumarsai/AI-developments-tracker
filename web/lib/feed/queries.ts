import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { ItemRow } from "../supabase/types";
import { rankItems } from "../ranking/score";
import { DEFAULT_WINDOW, type FeedSort, type FeedState, type FeedWindow } from "./types";

// Re-export the shared value types so existing importers of "@/lib/feed/queries"
// keep working; the definitions now live in the client-safe ./types module.
export { DEFAULT_WINDOW };
export type { FeedSort, FeedState, FeedWindow };

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

/** Upper bound on an incoming search term so a hostile query can't bloat the filter. */
const MAX_SEARCH_LENGTH = 100;

/**
 * Turn an untrusted free-text query into a safe PostgREST `ilike` needle.
 *
 * The search runs through `.or("title.ilike.*x*,summary.ilike.*x*")`, whose
 * grammar is delimited by commas and parentheses — and `%`/`_`/`\` are LIKE
 * wildcards. We strip all of those (plus quotes) so the term is treated as a
 * literal substring and can never break out of the filter. Returns "" when
 * nothing searchable remains.
 */
export function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()*%_\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

export type FeedQuery = {
  /** DB category to filter to; null/undefined = all categories. */
  category?: string | null;
  /** Restrict to one source (`items.source_id`); null/undefined = all sources. */
  source?: string | null;
  /** Restrict to items carrying this tag; null/undefined = no tag filter. */
  tag?: string | null;
  /** Free-text search across title + summary; null/undefined = no search. */
  q?: string | null;
  /** Feedback/read-state filter; null/undefined = no state filter. */
  state?: FeedState | null;
  /** Max items per source per day (settings); null/undefined = unlimited. */
  perSourceDailyCap?: number | null;
  sort?: FeedSort;
  window?: FeedWindow;
  limit?: number;
};

/**
 * Cap how many items each source may contribute per calendar day, preserving
 * input order (so the already-ranked/sorted list stays intact). This is the
 * "don't overwhelm me" de-crowder — a single prolific source (arXiv, a busy
 * subreddit) can't dominate the feed. `cap` null/≤0 = no capping.
 */
export function capPerSourceDay(items: ItemRow[], cap: number | null): ItemRow[] {
  if (cap == null || cap <= 0) return items;
  const counts = new Map<string, number>();
  const out: ItemRow[] = [];
  for (const item of items) {
    const day = item.published_at ? item.published_at.slice(0, 10) : "undated";
    const key = `${item.source_id}:${day}`;
    const seen = counts.get(key) ?? 0;
    if (seen >= cap) continue;
    counts.set(key, seen + 1);
    out.push(item);
  }
  return out;
}

/**
 * Load feed items. Default order is relevance (recency + popularity), which
 * interleaves every source into one ranked list. `recent`/`metric` are explicit
 * overrides. `category`, `source`, and `tag` narrow the set (all combine); the
 * `window` bounds and shapes ranking (default: one month).
 *
 * The Supabase client is injected (defaulting to the server client) so the
 * filter logic is unit-testable without a live database. Resilient callers
 * should catch — a Supabase failure throws here.
 */
export async function getFeedItems(
  {
    category,
    source,
    tag,
    q,
    state,
    perSourceDailyCap = null,
    sort = "relevant",
    window = DEFAULT_WINDOW,
    limit = INITIAL_FEED_LIMIT,
  }: FeedQuery = {},
  client: SupabaseClient = getServerClient(),
): Promise<ItemRow[]> {
  const now = Date.now();
  const windowDays = WINDOW_DAYS[window] ?? null;
  const cap = perSourceDailyCap;

  // Embed the source name so the card can label the item's platform accurately.
  let query = client.from("items").select("*, source:sources(name)");
  if (category) {
    query = query.eq("category", category);
  }
  if (source) {
    query = query.eq("source_id", source);
  }
  if (tag) {
    // Postgres array containment: rows whose `tags` include this value.
    query = query.contains("tags", [tag]);
  }
  if (q) {
    const needle = sanitizeSearch(q);
    if (needle) {
      // Case-insensitive substring match on title OR summary. `needle` is
      // sanitized above so it can't break the or()/LIKE grammar.
      query = query.or(`title.ilike.*${needle}*,summary.ilike.*${needle}*`);
    }
  }
  if (state === "unread") {
    query = query.eq("read_state", false);
  } else if (state === "liked") {
    query = query.eq("feedback_value", "up");
  } else if (state === "hide-down") {
    // Keep items with no vote or an up vote; drop only thumbs-down. (A plain
    // `neq.down` would also drop NULLs, so match null-or-up explicitly.)
    query = query.or("feedback_value.is.null,feedback_value.eq.up");
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
    return capPerSourceDay(rankItems(pool, now, decayDays), cap).slice(0, limit);
  }

  query =
    sort === "metric"
      ? query.order("metric", { ascending: false, nullsFirst: false })
      : query.order("published_at", { ascending: false, nullsFirst: false });
  // With a cap active we must over-fetch, then trim — otherwise capping a
  // limit-sized page would return fewer than `limit` rows.
  const fetchLimit = cap != null && cap > 0 ? RANK_POOL_SIZE : limit;
  const { data, error } = await query.limit(fetchLimit);
  if (error) {
    throw new Error(`Failed to load items: ${error.message}`);
  }
  // Unchecked cast: the untyped client returns any[]. Replace with generated
  // types once `supabase gen types typescript --local` is in the toolchain.
  const rows = (data ?? []) as unknown as ItemRow[];
  return capPerSourceDay(rows, cap).slice(0, limit);
}
