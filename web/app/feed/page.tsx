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
import { CURATED_PLATFORMS, isCuratedPlatform } from "@/lib/feed/platform";
import { feedHref } from "@/lib/feed/filterHref";
import { listViews, type SavedView } from "@/lib/views/persist";
import type { SavedFilters } from "@/lib/views/href";
import { SavedViewsBar } from "@/components/feed/SavedViewsBar";
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
  } = await searchParams;
  const active = sectionForSlug(sectionParam);

  // Untrusted URL params: keep a non-empty source id; trim + length-cap the tag.
  const source = sourceParam?.trim() ? sourceParam.trim() : undefined;
  // Only accept a known curated platform slug (guards against hostile URLs).
  const platform =
    platformParam && isCuratedPlatform(platformParam) ? platformParam : undefined;
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)] lg:max-w-none lg:px-[clamp(2rem,4vw,4rem)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            AI Chronicles
          </h1>
          <div className="flex items-baseline gap-4 text-xs uppercase tracking-[0.18em]">
            <span className="hidden text-faint sm:inline">Find the signal in AI</span>
            <Link href="/sources" className="text-muted transition-colors hover:text-ink">
              Sources
            </Link>
            <Link href="/settings" className="text-muted transition-colors hover:text-ink">
              Settings
            </Link>
            <AuthStatus />
          </div>
        </div>
        <nav aria-label="Categories" className="mt-4 -mx-1 overflow-x-auto">
          <ul className="flex gap-1">
            {FEED_SECTIONS.map((section) => {
              const isActive = section.slug === active.slug;
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
                    className={`inline-block rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-ink text-surface"
                        : "text-muted hover:text-ink hover:bg-rule/40"
                    }`}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <nav aria-label="Platform" className="mt-2 -mx-1 overflow-x-auto">
          <ul className="flex items-center gap-1 text-xs">
            <li className="pl-1 pr-1 text-faint">Platform</li>
            <li>
              <Link
                href={feedHref({
                  section: active.slug,
                  sort,
                  window,
                  source,
                  platform: null,
                  tag,
                  q,
                  state,
                })}
                aria-current={!platform ? "true" : undefined}
                className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors ${
                  !platform
                    ? "bg-ink text-surface"
                    : "text-muted hover:text-ink hover:bg-rule/40"
                }`}
              >
                All
              </Link>
            </li>
            {CURATED_PLATFORMS.map((p) => {
              const isActive = platform === p.slug;
              return (
                <li key={p.slug}>
                  <Link
                    href={feedHref({
                      section: active.slug,
                      sort,
                      window,
                      source,
                      platform: p.slug,
                      tag,
                      q,
                      state,
                    })}
                    aria-current={isActive ? "true" : undefined}
                    className={`inline-flex min-h-[36px] items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors ${
                      isActive
                        ? "bg-ink text-surface"
                        : "text-muted hover:text-ink hover:bg-rule/40"
                    }`}
                  >
                    {p.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        {window === "week" || window === "month" ? (
          <Suspense fallback={null}>
            <DigestCard period={window} />
          </Suspense>
        ) : null}
        <section aria-label="Feed" className="flex flex-1 flex-col">
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
              className="min-h-[44px] w-full flex-1 rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent"
            >
              Search
            </button>
          </form>
          <SavedViewsBar
            views={savedViews}
            current={currentFilters}
            hasActiveFilters={hasActiveFilters}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4 text-xs">
            <div className="flex items-center gap-1" aria-label="Time window">
              <span className="mr-1 text-faint">Window</span>
              {WINDOW_OPTIONS.map((option) => {
                const isActive = window === option.key;
                return (
                  <Link
                    key={option.key}
                    href={feedHref({
                      section: active.slug,
                      sort,
                      window: option.key,
                      source,
                      platform,
                      tag,
                      q,
                      state,
                    })}
                    aria-current={isActive ? "true" : undefined}
                    className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors ${
                      isActive
                        ? "bg-ink text-surface"
                        : "text-muted hover:text-ink hover:bg-rule/40"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-1" aria-label="Sort order">
              <span className="mr-1 text-faint">Sort</span>
              {sortOptions.map((option) => {
                const isActive = sort === option.key;
                return (
                  <Link
                    key={option.key}
                    href={feedHref({
                      section: active.slug,
                      sort: option.key,
                      window,
                      source,
                      platform,
                      tag,
                      q,
                      state,
                    })}
                    aria-current={isActive ? "true" : undefined}
                    className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors ${
                      isActive
                        ? "bg-ink text-surface"
                        : "text-muted hover:text-ink hover:bg-rule/40"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <nav aria-label="Feedback filter" className="mt-3 -mx-1 overflow-x-auto">
            <ul className="flex gap-1 text-xs">
              {STATE_OPTIONS.map((option) => {
                const isActive = state === option.key;
                return (
                  <li key={option.label}>
                    <Link
                      href={feedHref({
                        section: active.slug,
                        sort,
                        window,
                        source,
                        platform,
                        tag,
                        q,
                        state: option.key ?? null,
                      })}
                      aria-current={isActive ? "true" : undefined}
                      className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors ${
                        isActive
                          ? "bg-ink text-surface"
                          : "text-muted hover:text-ink hover:bg-rule/40"
                      }`}
                    >
                      {option.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Suspense
            key={`${active.slug}:${limit}:${sort}:${window}:${source ?? ""}:${platform ?? ""}:${tag ?? ""}:${q ?? ""}:${state ?? ""}`}
            fallback={<FeedFallback />}
          >
            <FeedList
              category={active.category}
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
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        The AI Chronicles · your personal AI radar
      </footer>
    </div>
  );
}
