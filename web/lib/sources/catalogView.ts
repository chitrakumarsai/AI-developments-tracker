import type { SourceStatus } from "../supabase/types";
import type { SourceWithCount } from "./persist";

/**
 * Pure view helpers for the tabbed source catalog (2.4.3). Splitting the catalog
 * by status, searching by name, and paginating are all derived state — kept out
 * of the component so they can be unit-tested and stay allocation-cheap.
 */

/** The tabs shown in the catalog, in display order. */
export const CATALOG_TABS: readonly SourceStatus[] = ["active", "paused", "archived"];

/** How many rows to reveal per "Show more" step within a tab. */
export const CATALOG_PAGE_SIZE = 20;

export type StatusCounts = Record<SourceStatus, number>;

/** Count sources per status — feeds the tab badges. */
export function countByStatus(sources: readonly SourceWithCount[]): StatusCounts {
  const counts: StatusCounts = { active: 0, paused: 0, archived: 0 };
  for (const source of sources) {
    // Guard against any legacy/unknown status leaking into a tab bucket.
    if (source.status in counts) counts[source.status] += 1;
  }
  return counts;
}

/**
 * Rows for one tab: filtered to `status`, then narrowed by a case-insensitive
 * name search. Order is preserved from the input (already priority/recency
 * sorted by the query). Returns a new array — never mutates the input.
 */
export function rowsForTab(
  sources: readonly SourceWithCount[],
  status: SourceStatus,
  search: string,
): SourceWithCount[] {
  const needle = search.trim().toLowerCase();
  return sources.filter(
    (source) =>
      source.status === status &&
      (needle === "" || source.name.toLowerCase().includes(needle)),
  );
}

export type PageResult = {
  /** The rows to render (first `visibleCount`, capped at what exists). */
  rows: SourceWithCount[];
  /** Whether a "Show more" affordance should appear. */
  hasMore: boolean;
  /** Total rows available before the visible-count cap (for "n of m"). */
  total: number;
};

/**
 * Slice `rows` down to the first `visibleCount`, reporting whether more remain.
 * `visibleCount` is clamped to be at least one page so a stale/zero value can't
 * hide every row.
 */
export function paginate(
  rows: readonly SourceWithCount[],
  visibleCount: number,
): PageResult {
  const cap = Math.max(CATALOG_PAGE_SIZE, visibleCount);
  return {
    rows: rows.slice(0, cap),
    hasMore: rows.length > cap,
    total: rows.length,
  };
}
