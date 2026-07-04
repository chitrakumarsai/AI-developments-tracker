import { feedHref } from "../feed/filterHref";
import { isCuratedPlatform } from "../feed/platform";
import { FEED_STATES, type FeedSort, type FeedState, type FeedWindow } from "../feed/types";

/** The filter dimensions a saved view can capture (mirrors the URL params). */
export type SavedFilters = {
  section?: string;
  sort?: FeedSort;
  window?: FeedWindow;
  source?: string;
  platform?: string;
  tag?: string;
  q?: string;
  state?: FeedState;
};

const SORTS: readonly FeedSort[] = ["relevant", "recent", "metric"];
const WINDOWS: readonly FeedWindow[] = ["today", "week", "month", "all"];

/** Length caps mirror the URL-param parsing in page.tsx so stored views can't bloat. */
const MAX_TAG = 64;
const MAX_Q = 100;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Coerce an untrusted `filters` blob (read back from `saved_views.filters` jsonb,
 * or an incoming request body) into a known, safe shape. Unknown keys are
 * dropped and enum values are validated, so a saved view can never produce a
 * malformed or unsafe URL (§12.7 — treat stored data as untrusted).
 */
export function normalizeFilters(raw: unknown): SavedFilters {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    section: str(o.section),
    sort: SORTS.includes(o.sort as FeedSort) ? (o.sort as FeedSort) : undefined,
    window: WINDOWS.includes(o.window as FeedWindow) ? (o.window as FeedWindow) : undefined,
    source: str(o.source),
    platform: str(o.platform) && isCuratedPlatform(str(o.platform) as string)
      ? str(o.platform)
      : undefined,
    tag: str(o.tag)?.slice(0, MAX_TAG),
    q: str(o.q)?.slice(0, MAX_Q),
    state: FEED_STATES.includes(o.state as FeedState) ? (o.state as FeedState) : undefined,
  };
}

/** Build the feed URL a saved view loads. Safe against junk stored filters. */
export function viewToHref(raw: unknown): string {
  const f = normalizeFilters(raw);
  return feedHref({
    section: f.section,
    sort: f.sort,
    window: f.window,
    source: f.source ?? null,
    platform: f.platform ?? null,
    tag: f.tag ?? null,
    q: f.q ?? null,
    state: f.state ?? null,
  });
}
