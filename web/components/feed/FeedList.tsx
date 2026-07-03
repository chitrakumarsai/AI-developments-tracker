import Link from "next/link";

import {
  getFeedItems,
  DEFAULT_WINDOW,
  FEED_PAGE_STEP,
  INITIAL_FEED_LIMIT,
  MAX_FEED_LIMIT,
  type FeedSort,
  type FeedWindow,
} from "@/lib/feed/queries";
import type { ItemRow } from "@/lib/supabase/types";
import { ItemCard } from "./ItemCard";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-[var(--space-section)] text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {body}
      </p>
    </div>
  );
}

type FeedListProps = {
  /** DB category to filter to; null/undefined shows all categories. */
  category?: string | null;
  /** Section label, used only for the empty-state copy. */
  sectionLabel?: string;
  /** Active section slug, used to build the Show more link. */
  sectionSlug?: string;
  /** How many items to show (finite-first). */
  limit?: number;
  /** Sort order — relevance (default), recency, or popularity. */
  sort?: FeedSort;
  /** Recency window bounding + shaping the feed. */
  window?: FeedWindow;
};

/** Build the Show more href, preserving section, sort, and window. */
function moreHref(
  sectionSlug: string,
  nextLimit: number,
  sort: FeedSort,
  window: FeedWindow,
): string {
  const params = new URLSearchParams();
  if (sectionSlug && sectionSlug !== "all") params.set("section", sectionSlug);
  if (sort === "metric") params.set("sort", "stars");
  else if (sort === "recent") params.set("sort", "recent");
  if (window !== DEFAULT_WINDOW) params.set("window", window);
  params.set("show", String(nextLimit));
  return `/?${params.toString()}`;
}

/**
 * Server component: loads recent items (optionally filtered to one category)
 * and renders the editorial feed, finite-first with an explicit Show more.
 * Resilient — a Supabase failure shows a notice instead of crashing the route.
 */
export async function FeedList({
  category,
  sectionLabel,
  sectionSlug = "all",
  limit = INITIAL_FEED_LIMIT,
  sort = "relevant",
  window = DEFAULT_WINDOW,
}: FeedListProps = {}) {
  let items: ItemRow[] = [];
  try {
    items = await getFeedItems({ category, sort, window, limit });
  } catch {
    return (
      <Notice
        title="Feed unavailable"
        body="Could not reach the database. Make sure the local Supabase stack is running (supabase start)."
      />
    );
  }

  if (items.length === 0) {
    const scope = category ? `${sectionLabel ?? "this section"}` : "the feed";
    return (
      <Notice
        title="No signal yet."
        body={`Nothing in ${scope} yet. Once a matching source is ingested, items will appear here.`}
      />
    );
  }

  // Heuristic (no count query): a full page likely means more remain.
  const canShowMore = items.length >= limit && limit < MAX_FEED_LIMIT;
  const nextLimit = Math.min(limit + FEED_PAGE_STEP, MAX_FEED_LIMIT);

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-center gap-3 py-6 text-xs text-faint">
        <span>Showing {items.length}</span>
        {canShowMore ? (
          <Link
            href={moreHref(sectionSlug, nextLimit, sort, window)}
            scroll={false}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-4 font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Show more
          </Link>
        ) : (
          <span>· end of {sectionLabel ?? "feed"}</span>
        )}
      </div>
    </>
  );
}
