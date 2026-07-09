import Link from "next/link";

import {
  getFeedItems,
  DEFAULT_WINDOW,
  FEED_PAGE_STEP,
  INITIAL_FEED_LIMIT,
  MAX_FEED_LIMIT,
  type FeedSort,
  type FeedState,
  type FeedWindow,
} from "@/lib/feed/queries";
import { feedHref, type FeedHrefParams } from "@/lib/feed/filterHref";
import { platformForItem, CURATED_PLATFORMS } from "@/lib/feed/platform";
import { getSettings } from "@/lib/settings/persist";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import type { ItemRow } from "@/lib/supabase/types";
import { ItemCard } from "./ItemCard";
import { ActiveFilters } from "./ActiveFilters";

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
  /** Multi-category filter (the More tab); takes precedence over `category`. */
  categories?: readonly string[] | null;
  /** Restrict to one source id; null/undefined shows all sources. */
  source?: string | null;
  /** Restrict to one derived platform slug; null/undefined = all platforms. */
  platform?: string | null;
  /** Restrict to items carrying this tag; null/undefined = no tag filter. */
  tag?: string | null;
  /** Free-text search across title + summary; null/undefined = no search. */
  q?: string | null;
  /** Feedback/read-state filter; null/undefined = no state filter. */
  state?: FeedState | null;
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

/**
 * Server component: loads recent items (optionally narrowed by category, source,
 * and/or tag) and renders the editorial feed, finite-first with an explicit
 * Show more. Resilient — a Supabase failure shows a notice instead of crashing.
 */
export async function FeedList({
  category,
  categories,
  source,
  platform,
  tag,
  q,
  state,
  sectionLabel,
  sectionSlug = "all",
  limit = INITIAL_FEED_LIMIT,
  sort = "relevant",
  window = DEFAULT_WINDOW,
}: FeedListProps = {}) {
  // Shared filter context: every in-feed link is built from this so the URL
  // stays the single source of truth and filters combine cleanly.
  const context: FeedHrefParams = {
    section: sectionSlug,
    sort,
    window,
    source,
    platform,
    tag,
    q,
    state,
  };

  // Auth-aware client + verified user drive per-user personalization (2.2):
  // settings, feedback, and read-state all scope to this reader via RLS.
  // Anonymous readers (userId null) get the shared feed with defaults.
  const client = await createServerSupabaseClient();
  const user = await getSessionUser();
  const userId = user?.id ?? null;

  // Settings shape the feed (per-source daily cap). A settings hiccup must not
  // break the feed, so fall back to defaults. When the user has filtered to a
  // single source, the cap is moot — show that source's full stream.
  let settings = DEFAULT_SETTINGS;
  try {
    settings = await getSettings(userId, client);
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  const perSourceDailyCap = source ? null : settings.topPerSourceDay;

  let items: ItemRow[] = [];
  try {
    items = await getFeedItems(
      {
        category,
        categories,
        source,
        platform,
        tag,
        q,
        state,
        userId,
        perSourceDailyCap,
        includeKeywords: settings.includeKeywords,
        excludeKeywords: settings.excludeKeywords,
        minMetric: settings.minMetric,
        sort,
        window,
        limit,
      },
      client,
    );
  } catch {
    return (
      <Notice
        title="Feed unavailable"
        body="Could not reach the database. Make sure the local Supabase stack is running (supabase start)."
      />
    );
  }

  // All rows share the same source when filtered, so the first item names it.
  const sourceLabel = source
    ? (items[0] ? platformForItem(items[0]).label : null)
    : null;
  const platformLabel = platform
    ? (CURATED_PLATFORMS.find((p) => p.slug === platform)?.label ?? platform)
    : null;

  if (items.length === 0) {
    const isFiltered = Boolean(source || platform || tag || q || state);
    const scope =
      category || (categories && categories.length > 0)
        ? `${sectionLabel ?? "this section"}`
        : "the feed";
    return (
      <>
        <ActiveFilters context={context} sourceLabel={sourceLabel} platformLabel={platformLabel} />
        <Notice
          title="No matches."
          body={
            isFiltered
              ? "No items match these filters. Clear one above to widen the feed."
              : `Nothing in ${scope} yet. Once a matching source is ingested, items will appear here.`
          }
        />
      </>
    );
  }

  // Heuristic (no count query): a full page likely means more remain.
  const canShowMore = items.length >= limit && limit < MAX_FEED_LIMIT;
  const nextLimit = Math.min(limit + FEED_PAGE_STEP, MAX_FEED_LIMIT);

  return (
    <>
      <ActiveFilters context={context} sourceLabel={sourceLabel} platformLabel={platformLabel} />

      <ul className="grid grid-cols-1 gap-x-10 lg:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} context={context} />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-center gap-3 py-6 text-xs text-faint">
        <span>Showing {items.length}</span>
        {canShowMore ? (
          <Link
            href={feedHref({ ...context, show: nextLimit })}
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
