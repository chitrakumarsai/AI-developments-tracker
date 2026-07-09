import { DEFAULT_WINDOW, type FeedSort, type FeedState, type FeedWindow } from "./types";

/**
 * The complete, shareable feed filter state expressed as URL params. Every
 * feed navigation (category tabs, window/sort controls, source badge, tag
 * chip, active-filter pills, Show more) builds its href from this one shape so
 * the URL is the single source of truth and links can't drift apart.
 */
export type FeedHrefParams = {
  /** Section slug; `"all"` (or absent) means no category filter. */
  section?: string;
  sort?: FeedSort;
  window?: FeedWindow;
  /** Active source id (`items.source_id`); null/absent = no source filter. */
  source?: string | null;
  /** Active platform slug (e.g. "github"); null/absent = no platform filter. */
  platform?: string | null;
  /** Active tag; null/absent = no tag filter. Encoded safely (untrusted text). */
  tag?: string | null;
  /** Free-text search query; null/absent = no search. Encoded safely (untrusted text). */
  q?: string | null;
  /** Feedback/read-state filter; null/absent = no state filter. */
  state?: FeedState | null;
  /** Paging size; null/absent = default first page. */
  show?: number | null;
};

/**
 * The gated feed app lives at `/feed` (2.4 — `/` is now the public landing).
 * Every filter link is built from this base so the whole app follows the route
 * in one place.
 */
export const FEED_BASE_PATH = "/feed";

/**
 * Build a feed URL from filter state, omitting defaults so canonical links stay
 * clean (`/feed` for the unfiltered feed). `URLSearchParams` percent-encodes
 * values, so a tag with spaces or symbols is safe to embed.
 */
export function feedHref(params: FeedHrefParams = {}): string {
  const sp = new URLSearchParams();
  if (params.section && params.section !== "all") sp.set("section", params.section);
  if (params.sort === "metric") sp.set("sort", "stars");
  else if (params.sort === "recent") sp.set("sort", "recent");
  if (params.window && params.window !== DEFAULT_WINDOW) sp.set("window", params.window);
  if (params.source) sp.set("source", params.source);
  if (params.platform) sp.set("platform", params.platform);
  if (params.tag) sp.set("tag", params.tag);
  if (params.q) sp.set("q", params.q);
  if (params.state) sp.set("state", params.state);
  if (params.show != null) sp.set("show", String(params.show));
  const qs = sp.toString();
  return qs ? `${FEED_BASE_PATH}?${qs}` : FEED_BASE_PATH;
}

/**
 * The feed URL for the source-picker dropdown (v4 findability). Selecting a
 * source narrows the current view to it and forces the all-time window, so a
 * freshly-ingested source's older items surface instead of being clipped by the
 * default 30-day window. An empty id clears the source filter and restores the
 * view's current window. Every other active filter is preserved.
 */
export function sourceFilterHref(
  current: FeedHrefParams,
  sourceId: string,
): string {
  const id = sourceId.trim();
  return feedHref({
    ...current,
    source: id || null,
    window: id ? "all" : current.window,
    // Reset paging: a re-scoped feed should start from the first page.
    show: null,
  });
}
