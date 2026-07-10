import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { FeedList } from "@/components/feed/FeedList";
import { DigestCard } from "@/components/feed/DigestCard";
import { FEED_SECTIONS, sectionForSlug } from "@/lib/feed/categories";
import {
  INITIAL_FEED_LIMIT,
  MAX_FEED_LIMIT,
  DEFAULT_WINDOW,
  type FeedSort,
  type FeedState,
  type FeedWindow,
} from "@/lib/feed/queries";
import { FEED_STATES } from "@/lib/feed/types";
import { CURATED_PLATFORMS, isKnownPlatform } from "@/lib/feed/platform";
import { feedHref } from "@/lib/feed/filterHref";
import { listViews, type SavedView } from "@/lib/views/persist";
import type { SavedFilters } from "@/lib/views/href";
import { SavedViewsBar } from "@/components/feed/SavedViewsBar";
import { FilterGroup } from "@/components/feed/FilterGroup";
import { SourcePicker } from "@/components/feed/SourcePicker";
import { MyViews } from "@/components/feed/MyViews";
import { WelcomeBanner } from "@/components/feed/WelcomeBanner";
import { listSourceOptions, type SourceOption } from "@/lib/sources/persist";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { getSessionUser } from "@/lib/auth/session";
import { requireSession } from "@/lib/auth/gate";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

/** Sections whose items carry a popularity metric, so a Top-starred sort makes sense. */
const SORTABLE_SLUGS = new Set(["repos", "models"]);

/** Cap the length of an incoming tag param so a hostile URL can't bloat state. */
const MAX_TAG_LENGTH = 64;

/** Cap the length of an incoming search param (mirrors the query-side sanitizer). */
const MAX_SEARCH_LENGTH = 100;

const WINDOW_OPTIONS: ReadonlyArray<{ key: FeedWindow; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];
const WINDOW_KEYS: ReadonlySet<string> = new Set(WINDOW_OPTIONS.map((w) => w.key));

/** Feedback/read-state segmented control. `undefined` key = the default "All". */
const STATE_OPTIONS: ReadonlyArray<{ key: FeedState | undefined; label: string }> = [
  { key: undefined, label: "All" },
  { key: "unread", label: "Unread" },
  { key: "liked", label: "Liked" },
  { key: "hide-down", label: "Hide 👎" },
];
const STATE_KEYS: ReadonlySet<string> = new Set(FEED_STATES);

// The feed reflects live database state, so render per-request (not at build).
export const dynamic = "force-dynamic";

// Gated app route (2.4): keep it out of search indexes as defense in depth
// (robots.txt disallow only blocks crawling; this blocks indexing of a URL
// discovered via an external link).
export const metadata: Metadata = { robots: { index: false, follow: false } };

function FeedFallback() {
  return (
    <div className="py-[var(--space-section)] text-center text-sm text-muted">
      Loading the feed…
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    show?: string;
    sort?: string;
    window?: string;
    source?: string;
    platform?: string;
    tag?: string;
    q?: string;
    state?: string;
    id?: string;
  }>;
}) {
  // The feed is the gated app (2.4): anonymous visitors are sent to sign-in
  // (the public landing at `/` is the only unauthenticated surface).
  await requireSession("/feed");

  const {
    section: sectionParam,
    show: showParam,
    sort: sortParam,
    window: windowParam,
    source: sourceParam,
    platform: platformParam,
    tag: tagParam,
    q: qParam,
    state: stateParam,
    id: idParam,
  } = await searchParams;
  // Cap an incoming product id so a hostile URL can't bloat state (it's matched
  // against the user's rows anyway).
  const productId = idParam?.trim() ? idParam.trim().slice(0, 64) : undefined;
  const active = sectionForSlug(sectionParam);
  // The Ask tab (v5) is a prompt surface, not a category feed: it renders the
  // reader's saved natural-language views instead of a filtered item list, so
  // the search box and filter controls below don't apply to it.
  const isAsk = active.isPrompt === true;

  // Untrusted URL params: keep a non-empty source id; trim + length-cap the tag.
  const source = sourceParam?.trim() ? sourceParam.trim() : undefined;
  // Only accept a platform slug this app can resolve (guards against hostile
  // URLs). Broader than the picker's chips: a platform that left the picker is
  // still a valid deep link.
  const platform =
    platformParam && isKnownPlatform(platformParam) ? platformParam : undefined;
  const tag = tagParam?.trim() ? tagParam.trim().slice(0, MAX_TAG_LENGTH) : undefined;
  const q = qParam?.trim() ? qParam.trim().slice(0, MAX_SEARCH_LENGTH) : undefined;
  const state: FeedState | undefined = STATE_KEYS.has(stateParam ?? "")
    ? (stateParam as FeedState)
    : undefined;
  const requested = Number.parseInt(showParam ?? "", 10);
  const limit = Number.isNaN(requested)
    ? INITIAL_FEED_LIMIT
    : Math.min(Math.max(requested, INITIAL_FEED_LIMIT), MAX_FEED_LIMIT);
  const canSort = SORTABLE_SLUGS.has(active.slug);

  // Default order is Relevant (recency + popularity). Newest is a universal
  // override; Top-starred only where a popularity metric exists.
  let sort: FeedSort = "relevant";
  if (sortParam === "recent") sort = "recent";
  else if (sortParam === "stars" && canSort) sort = "metric";

  const window: FeedWindow = WINDOW_KEYS.has(windowParam ?? "")
    ? (windowParam as FeedWindow)
    : DEFAULT_WINDOW;

  const sortOptions: ReadonlyArray<{ key: FeedSort; label: string }> = [
    { key: "relevant", label: "Relevant" },
    { key: "recent", label: "Newest" },
    ...(canSort ? [{ key: "metric" as const, label: "Top-starred" }] : []),
  ];

  // The search box is a native GET form so it needs no client JS. Carry the
  // other active filters as hidden inputs (mirroring feedHref's URL tokens) so
  // searching narrows the *current* view instead of resetting it.
  const searchHiddenFields: ReadonlyArray<{ name: string; value: string }> = [
    ...(active.slug !== "all" ? [{ name: "section", value: active.slug }] : []),
    ...(sort !== "relevant"
      ? [{ name: "sort", value: sort === "metric" ? "stars" : "recent" }]
      : []),
    ...(window !== DEFAULT_WINDOW ? [{ name: "window", value: window }] : []),
    ...(source ? [{ name: "source", value: source }] : []),
    ...(platform ? [{ name: "platform", value: platform }] : []),
    ...(tag ? [{ name: "tag", value: tag }] : []),
    ...(state ? [{ name: "state", value: state }] : []),
  ];

  // Saved views: the current (non-default) filter set is offered for saving, and
  // the stored presets are loaded for the bar. A DB hiccup must not break the
  // feed, so fall back to an empty list.
  const currentFilters: SavedFilters = {
    section: active.slug !== "all" ? active.slug : undefined,
    sort: sort !== "relevant" ? sort : undefined,
    window: window !== DEFAULT_WINDOW ? window : undefined,
    source,
    platform,
    tag,
    q,
    state,
  };
  const hasActiveFilters =
    Boolean(source || platform || tag || q || state) ||
    active.slug !== "all" ||
    sort !== "relevant" ||
    window !== DEFAULT_WINDOW;
  // Saved views are per-user (2.2): only the signed-in reader's presets, RLS-scoped.
  let savedViews: SavedView[] = [];
  try {
    const user = await getSessionUser();
    if (user) {
      const client = await createServerSupabaseClient();
      savedViews = await listViews(user.id, client);
    }
  } catch {
    savedViews = [];
  }

  // Source-picker options (v4 findability): active sources for the dropdown. A
  // DB hiccup must not break the feed — fall back to none (the picker hides).
  let sourceOptions: SourceOption[] = [];
  try {
    const client = await createServerSupabaseClient();
    sourceOptions = await listSourceOptions(client);
  } catch {
    sourceOptions = [];
  }

  // The shared filter context the source picker preserves when it navigates.
  const feedContext = {
    section: active.slug,
    sort,
    window,
    source,
    platform,
    tag,
    q,
    state,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)] lg:max-w-none lg:px-[clamp(2rem,4vw,4rem)]">
      {/*
        Three distinct zones, separated by rules rather than crammed together:
        (1) identity + account, (2) primary category navigation, (3) the filter
        bar below. Platform used to sit here as a third nav row, but it is a
        *filter*, not navigation — it now lives with Window/Source/Sort/Show.
      */}
      <header className="border-b border-rule">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              AI Chronicles
            </h1>
            <p className="mt-0.5 text-xs text-faint">Find the signal in AI</p>
          </div>
          <nav aria-label="Account" className="flex items-center gap-1 text-sm">
            <Link
              href="/sources"
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              Sources
            </Link>
            <Link
              href="/settings"
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              Settings
            </Link>
            <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
            <AuthStatus />
          </nav>
        </div>

        <nav aria-label="Categories" className="-mx-1 pb-px">
          <ul className="flex gap-0.5 overflow-x-auto">
            {FEED_SECTIONS.map((section) => {
              const isActive = section.slug === active.slug;
              // The Ask tab is the one LLM-backed destination in this nav, so it
              // carries the AI gradient (and shimmers once on hover/focus).
              const isAi = section.isPrompt === true;
              return (
                <li key={section.slug}>
                  <Link
                    href={feedHref({
                      section: section.slug,
                      sort: "relevant",
                      window,
                      source,
                      platform,
                      tag,
                      q,
                      state,
                    })}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap rounded-t-[var(--radius-sm)] px-3 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:transition-colors ${
                      isActive
                        ? "text-ink after:bg-accent"
                        : "text-muted after:bg-transparent hover:text-ink hover:after:bg-rule"
                    } ${isAi ? "ai-surface" : ""}`}
                  >
                    {isAi ? (
                      <span aria-hidden className="text-[0.7rem] text-ai-to">
                        &#10022;
                      </span>
                    ) : null}
                    <span className={isAi && !isActive ? "ai-text" : undefined}>
                      {section.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <WelcomeBanner />
        {window === "week" || window === "month" ? (
          <Suspense fallback={null}>
            <DigestCard period={window} />
          </Suspense>
        ) : null}
        <section aria-label="Feed" className="flex flex-1 flex-col">
          {isAsk ? (
            <MyViews productId={productId} />
          ) : (
            <>
          <form
            method="get"
            action="/feed"
            role="search"
            className="flex items-center gap-2 pt-4"
          >
            {searchHiddenFields.map((field) => (
              <input
                key={field.name}
                type="hidden"
                name={field.name}
                value={field.value}
              />
            ))}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search titles & summaries…"
              aria-label="Search the feed"
              maxLength={MAX_SEARCH_LENGTH}
              className="min-h-[44px] w-full flex-1 rounded-[var(--radius-md)] border border-rule bg-sunken px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:bg-surface"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>
          <SavedViewsBar
            views={savedViews}
            current={currentFilters}
            hasActiveFilters={hasActiveFilters}
          />
          {/*
            The filter bar must NOT establish a scroll container: the source
            picker's listbox is absolutely positioned, and `overflow-x: auto`
            makes overflow-y compute to `auto` too (CSS Overflow §3), which
            clips the popup away. So the groups wrap onto extra rows on narrow
            screens instead of scrolling sideways.
          */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <FilterGroup
                label="Window"
                options={WINDOW_OPTIONS.map((option) => ({
                  key: option.key,
                  label: option.label,
                  isActive: window === option.key,
                  href: feedHref({
                    section: active.slug,
                    sort,
                    window: option.key,
                    source,
                    platform,
                    tag,
                    q,
                    state,
                  }),
                }))}
              />
              <SourcePicker
                sources={sourceOptions}
                current={feedContext}
                activeSource={source}
              />
              {/* Platform is a filter, so it lives here — not as a nav row. */}
              <FilterGroup
                label="Platform"
                options={[
                  { slug: null, label: "All" },
                  ...CURATED_PLATFORMS.map((p) => ({ slug: p.slug as string | null, label: p.label })),
                ].map((p) => ({
                  key: p.slug ?? "all",
                  label: p.label,
                  isActive: (platform ?? null) === p.slug,
                  href: feedHref({
                    section: active.slug,
                    sort,
                    window,
                    source,
                    platform: p.slug,
                    tag,
                    q,
                    state,
                  }),
                }))}
              />
              <FilterGroup
                label="Sort"
                options={sortOptions.map((option) => ({
                  key: option.key,
                  label: option.label,
                  isActive: sort === option.key,
                  href: feedHref({
                    section: active.slug,
                    sort: option.key,
                    window,
                    source,
                    platform,
                    tag,
                    q,
                    state,
                  }),
                }))}
              />
              <FilterGroup
                label="Show"
                options={STATE_OPTIONS.map((option) => ({
                  key: option.key ?? "all",
                  label: option.label,
                  isActive: state === option.key,
                  href: feedHref({
                    section: active.slug,
                    sort,
                    window,
                    source,
                    platform,
                    tag,
                    q,
                    state: option.key ?? null,
                  }),
                }))}
              />
            </div>
          </div>
          <Suspense
            key={`${active.slug}:${limit}:${sort}:${window}:${source ?? ""}:${platform ?? ""}:${tag ?? ""}:${q ?? ""}:${state ?? ""}`}
            fallback={<FeedFallback />}
          >
            <FeedList
              category={active.category}
              categories={active.categories}
              source={source}
              platform={platform}
              tag={tag}
              q={q}
              state={state}
              sectionLabel={active.label}
              sectionSlug={active.slug}
              limit={limit}
              sort={sort}
              window={window}
            />
          </Suspense>
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        The AI Chronicles · your personal AI radar
      </footer>
    </div>
  );
}
