import { Suspense } from "react";
import Link from "next/link";

import { FeedList } from "@/components/feed/FeedList";
import { FEED_SECTIONS, sectionForSlug } from "@/lib/feed/categories";

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
  searchParams: Promise<{ section?: string }>;
}) {
  const { section: sectionParam } = await searchParams;
  const active = sectionForSlug(sectionParam);

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
          <Suspense key={active.slug} fallback={<FeedFallback />}>
            <FeedList category={active.category} sectionLabel={active.label} />
          </Suspense>
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Phase 1 · single-user development build
      </footer>
    </div>
  );
}
