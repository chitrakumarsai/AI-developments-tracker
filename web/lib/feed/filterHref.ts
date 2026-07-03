import { DEFAULT_WINDOW, type FeedSort, type FeedWindow } from "./types";

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
  /** Active tag; null/absent = no tag filter. Encoded safely (untrusted text). */
  tag?: string | null;
  /** Paging size; null/absent = default first page. */
  show?: number | null;
};

/**
 * Build a feed URL from filter state, omitting defaults so canonical links stay
 * clean (`/` for the unfiltered feed). `URLSearchParams` percent-encodes values,
 * so a tag with spaces or symbols is safe to embed.
 */
export function feedHref(params: FeedHrefParams = {}): string {
  const sp = new URLSearchParams();
  if (params.section && params.section !== "all") sp.set("section", params.section);
  if (params.sort === "metric") sp.set("sort", "stars");
  else if (params.sort === "recent") sp.set("sort", "recent");
  if (params.window && params.window !== DEFAULT_WINDOW) sp.set("window", params.window);
  if (params.source) sp.set("source", params.source);
  if (params.tag) sp.set("tag", params.tag);
  if (params.show != null) sp.set("show", String(params.show));
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}
