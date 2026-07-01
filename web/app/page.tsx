import { Suspense } from "react";

import { FeedList } from "@/components/feed/FeedList";

// The feed reflects live database state, so render per-request (not at build).
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Papers",
  "Repos",
  "Models",
  "Companies",
  "Social",
  "Products",
] as const;

function FeedFallback() {
  return (
    <div className="py-[var(--space-section)] text-center text-sm text-muted">
      Loading the feed…
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Sonar
          </h1>
          <span className="text-xs uppercase tracking-[0.18em] text-faint">
            Find the signal in AI
          </span>
        </div>
        <nav aria-label="Categories" className="mt-4 -mx-1 overflow-x-auto">
          <ul className="flex gap-1">
            {CATEGORIES.map((category) => (
              <li key={category}>
                <button
                  type="button"
                  className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink hover:bg-rule/40"
                >
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section aria-label="Feed" className="flex flex-1 flex-col">
          <Suspense fallback={<FeedFallback />}>
            <FeedList />
          </Suspense>
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        Sonar · Phase 1 · single-user development build
      </footer>
    </div>
  );
}
