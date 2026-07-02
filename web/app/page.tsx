import { Suspense } from "react";
import Link from "next/link";

import { FeedList } from "@/components/feed/FeedList";
import { FEED_SECTIONS, sectionForSlug } from "@/lib/feed/categories";
import { INITIAL_FEED_LIMIT, MAX_FEED_LIMIT, type FeedSort } from "@/lib/feed/queries";

/** Sections whose items carry a popularity metric, so a Top-starred sort makes sense. */
const SORTABLE_SLUGS = new Set(["repos", "models"]);

// The feed reflects live database state, so render per-request (not at build).
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ section?: string; show?: string; sort?: string }>;
}) {
  const { section: sectionParam, show: showParam, sort: sortParam } = await searchParams;
  const active = sectionForSlug(sectionParam);
  const requested = Number.parseInt(showParam ?? "", 10);
  const limit = Number.isNaN(requested)
    ? INITIAL_FEED_LIMIT
    : Math.min(Math.max(requested, INITIAL_FEED_LIMIT), MAX_FEED_LIMIT);
  const canSort = SORTABLE_SLUGS.has(active.slug);
  const sort: FeedSort = canSort && sortParam === "stars" ? "metric" : "recent";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            AI Chronicles
          </h1>
          <span className="text-xs uppercase tracking-[0.18em] text-faint">
            Find the signal in AI
          </span>
        </div>
        <nav aria-label="Categories" className="mt-4 -mx-1 overflow-x-auto">
          <ul className="flex gap-1">
            {FEED_SECTIONS.map((section) => {
              const isActive = section.slug === active.slug;
              return (
                <li key={section.slug}>
                  <Link
                    href={section.slug === "all" ? "/" : `/?section=${section.slug}`}
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
      </header>

      <main className="flex flex-1 flex-col">
        <section aria-label="Feed" className="flex flex-1 flex-col">
          {canSort ? (
            <div className="flex items-center justify-end gap-1 pt-4 text-xs">
              <span className="mr-1 text-faint">Sort</span>
              {(
                [
                  { key: "recent", label: "Newest", href: `/?section=${active.slug}` },
                  {
                    key: "metric",
                    label: "Top-starred",
                    href: `/?section=${active.slug}&sort=stars`,
                  },
                ] as const
              ).map((option) => {
                const isActive = sort === option.key;
                return (
                  <Link
                    key={option.key}
                    href={option.href}
                    aria-current={isActive ? "true" : undefined}
                    className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-3 font-medium transition-colors ${
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
          ) : null}
          <Suspense key={`${active.slug}:${limit}:${sort}`} fallback={<FeedFallback />}>
            <FeedList
              category={active.category}
              sectionLabel={active.label}
              sectionSlug={active.slug}
              limit={limit}
              sort={sort}
            />
          </Suspense>
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Phase 1 · single-user development build
      </footer>
    </div>
  );
}
