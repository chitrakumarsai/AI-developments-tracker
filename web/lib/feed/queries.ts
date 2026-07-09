import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItemRow } from "../supabase/types";
import { rankItems } from "../ranking/score";
import {
  annotateWithUserState,
  loadUserItemState,
  type UserItemState,
} from "../feedback/userState";
import { platformFromSourceName } from "./platform";
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
  /**
   * Filter to ANY of these categories (the More catch-all tab). Takes
   * precedence over `category`; empty/undefined = no multi-category filter.
   */
  categories?: readonly string[] | null;
  /** Restrict to one source (`items.source_id`); null/undefined = all sources. */
  source?: string | null;
  /** Restrict to one derived platform slug (e.g. "github"); null/undefined = all. */
  platform?: string | null;
  /** Restrict to items carrying this tag; null/undefined = no tag filter. */
  tag?: string | null;
  /** Free-text search across title + summary; null/undefined = no search. */
  q?: string | null;
  /** Feedback/read-state filter; null/undefined = no state filter. */
  state?: FeedState | null;
  /**
   * Signed-in user whose votes/read-state annotate the feed; null = anonymous.
   * Per-user feedback is private (2.2), so the `state` filter and ranking boost
   * only reflect this user's own signal.
   */
  userId?: string | null;
  /** Max items per source per day (settings); null/undefined = unlimited. */
  perSourceDailyCap?: number | null;
  /** Keep only items matching ANY of these words (settings); empty = no include filter. */
  includeKeywords?: string[];
  /** Drop items matching ANY of these words (settings). */
  excludeKeywords?: string[];
  /** Hide items whose metric is below this (settings); null/undefined = no floor. */
  minMetric?: number | null;
  sort?: FeedSort;
  window?: FeedWindow;
  limit?: number;
};

/** Lowercased haystack (title + summary + tags) for keyword matching. */
function haystack(item: ItemRow): string {
  return `${item.title} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase();
}

type ContentFilters = {
  includeKeywords?: string[];
  excludeKeywords?: string[];
  minMetric?: number | null;
};

/**
 * Apply the settings content filters (app-feedback-v3):
 *  - `minMetric`: drop items whose metric is *below* the floor. Items with NO
 *    metric (papers, blogs) are kept — a star floor shouldn't hide all papers.
 *  - `excludeKeywords`: drop items matching ANY excluded word.
 *  - `includeKeywords`: when non-empty, keep only items matching ANY of them.
 * Keywords are already lowercased/sanitized by `normalizeSettings`.
 */
export function applyContentFilters(
  items: ItemRow[],
  { includeKeywords = [], excludeKeywords = [], minMetric = null }: ContentFilters,
): ItemRow[] {
  if (!includeKeywords.length && !excludeKeywords.length && minMetric == null) {
    return items;
  }
  return items.filter((item) => {
    if (minMetric != null && item.metric != null && item.metric < minMetric) return false;
    const hay = excludeKeywords.length || includeKeywords.length ? haystack(item) : "";
    if (excludeKeywords.length && excludeKeywords.some((kw) => hay.includes(kw))) return false;
    if (includeKeywords.length && !includeKeywords.some((kw) => hay.includes(kw))) return false;
    return true;
  });
}

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
 * Apply the feedback/read-state filter in JS. In Phase 1 this ran at the DB on
 * the global `items.read_state`/`items.feedback_value` columns; those are now
 * per-user (2.2), so we filter on the annotated rows instead. Called after
 * `annotateWithUserState`, so `read_state`/`feedback_value` reflect THIS user.
 *  - `unread`:    items the user has not opened.
 *  - `liked`:     items the user thumbed up.
 *  - `hide-down`: everything except the user's thumbs-down.
 */
export function applyStateFilter(items: ItemRow[], state: FeedState | null | undefined): ItemRow[] {
  if (!state) return items;
  if (state === "unread") return items.filter((item) => !item.read_state);
  if (state === "liked") return items.filter((item) => item.feedback_value === "up");
  return items.filter((item) => item.feedback_value !== "down"); // hide-down
}

/**
 * Resolve a derived platform slug (github, hugging-face, reddit, hacker-news,
 * arXiv) to the set of source ids on that platform. Platform isn't a column —
 * it's derived from the source NAME — so we map every source through the same
 * `platformFromSourceName` logic the card badges use and collect the matches.
 * This lets the feed query filter by platform at the DB level (`source_id in …`)
 * instead of post-filtering a recency-limited pool, which would miss platforms
 * that aren't in the most-recent N. Returns [] when nothing matches.
 */
export async function resolvePlatformSourceIds(
  platformSlug: string,
  client: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await client.from("sources").select("id, name");
  if (error) {
    throw new Error(`Failed to resolve platform sources: ${error.message}`);
  }
  return ((data ?? []) as Array<{ id: string; name: string | null }>)
    .filter((s) => platformFromSourceName(s.name)?.slug === platformSlug)
    .map((s) => s.id);
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
    categories = null,
    source,
    platform = null,
    tag,
    q,
    state,
    userId = null,
    perSourceDailyCap = null,
    includeKeywords = [],
    excludeKeywords = [],
    minMetric = null,
    sort = "relevant",
    window = DEFAULT_WINDOW,
    limit = INITIAL_FEED_LIMIT,
  }: FeedQuery = {},
  client: SupabaseClient,
): Promise<ItemRow[]> {
  const now = Date.now();
  const windowDays = WINDOW_DAYS[window] ?? null;
  const cap = perSourceDailyCap;
  const contentFilters = { includeKeywords, excludeKeywords, minMetric };
  // Any post-fetch reducer (cap, content filters, or the now-per-user state
  // filter) means we must over-fetch a pool and trim, so a limit-sized page isn't
  // left short after filtering. `state` moved from DB to JS with per-user data.
  const hasReducers =
    (cap != null && cap > 0) ||
    minMetric != null ||
    includeKeywords.length > 0 ||
    excludeKeywords.length > 0 ||
    state != null;

  // Platform is derived from the source name, so resolve it to source ids and
  // filter at the DB level (below) rather than post-filtering a recency pool.
  let platformSourceIds: string[] | null = null;
  if (platform) {
    platformSourceIds = await resolvePlatformSourceIds(platform, client);
    if (platformSourceIds.length === 0) return []; // no sources on this platform
  }

  // Embed the source name so the card can label the item's platform accurately.
  let query = client.from("items").select("*, source:sources(name)");
  // The More tab filters to a SET of categories; a single-category tab uses one.
  // `categories` wins when present so the More tab can't be narrowed to one.
  if (categories && categories.length > 0) {
    query = query.in("category", categories as string[]);
  } else if (category) {
    query = query.eq("category", category);
  }
  if (source) {
    query = query.eq("source_id", source);
  }
  if (platformSourceIds) {
    query = query.in("source_id", platformSourceIds);
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
  // NOTE: the feedback/read-state filter is applied in JS after per-user
  // annotation (see below) — it can no longer run at the DB now that vote and
  // read-state are per-user rather than global columns on `items`.
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
    const pool = await annotatePool((data ?? []) as unknown as ItemRow[], client, userId);
    const decayDays = windowDays ?? UNBOUNDED_DECAY_DAYS;
    // Rank first (feedback boost uses the per-user vote), then apply the per-user
    // state filter + content filters, then cap.
    const ranked = rankItems(pool, now, decayDays);
    const stateFiltered = applyStateFilter(ranked, state);
    const contentFiltered = applyContentFilters(stateFiltered, contentFilters);
    return capPerSourceDay(contentFiltered, cap).slice(0, limit);
  }

  query =
    sort === "metric"
      ? query.order("metric", { ascending: false, nullsFirst: false })
      : query.order("published_at", { ascending: false, nullsFirst: false });
  // With any post-fetch reducer active we over-fetch, then trim — otherwise a
  // limit-sized page would be left short after filtering/capping.
  const fetchLimit = hasReducers ? RANK_POOL_SIZE : limit;
  const { data, error } = await query.limit(fetchLimit);
  if (error) {
    throw new Error(`Failed to load items: ${error.message}`);
  }
  // Unchecked cast: the untyped client returns any[]. Replace with generated
  // types once `supabase gen types typescript --local` is in the toolchain.
  const rows = await annotatePool((data ?? []) as unknown as ItemRow[], client, userId);
  const stateFiltered = applyStateFilter(rows, state);
  const filtered = applyContentFilters(stateFiltered, contentFilters);
  return capPerSourceDay(filtered, cap).slice(0, limit);
}

/**
 * Overlay the current user's private vote + read-state onto a fetched pool. The
 * same client is reused (it's the auth-aware session client, so RLS returns only
 * this user's rows); anonymous callers get the pool back unannotated.
 */
async function annotatePool(
  pool: ItemRow[],
  client: SupabaseClient,
  userId: string | null,
): Promise<ItemRow[]> {
  if (pool.length === 0) return pool;
  // Always annotate — even for anonymous readers — so the Phase-1 GLOBAL
  // feedback_value/read_state columns still present on `items.*` are reset to
  // "unvoted / unread" rather than leaking the owner's pre-migration signal onto
  // the public feed. Signed-in readers get their own private state overlaid.
  const state: UserItemState = userId
    ? await loadUserItemState(client, userId, pool.map((item) => item.id))
    : { votes: new Map(), reads: new Set() };
  return annotateWithUserState(pool, state);
}
