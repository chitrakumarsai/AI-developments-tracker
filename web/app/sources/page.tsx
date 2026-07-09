import type { Metadata } from "next";
import Link from "next/link";

import { listSuggested, type SourceCandidate } from "@/lib/candidates/persist";
import { listSourcesWithCounts, type SourceWithCount } from "@/lib/sources/persist";
import { AddCandidateForm } from "@/components/sources/AddCandidateForm";
import { ImportListForm } from "@/components/sources/ImportListForm";
import { CandidateCard } from "@/components/sources/CandidateCard";
import { AddSourceForm } from "@/components/sources/AddSourceForm";
import { SourceCatalog } from "@/components/sources/SourceCatalog";
import { requireSession } from "@/lib/auth/gate";

// Reflects live database state; render per-request.
export const dynamic = "force-dynamic";

// Gated app route (2.4): never index.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SourcesPage() {
  // Gated app route (2.4): source curation is not part of the public surface.
  // The owner additionally gets management controls (add + ingest, 2.4.2).
  const user = await requireSession("/sources");
  const isOwner = user.role === "owner";

  let sources: SourceWithCount[] = [];
  let catalogFailed = false;
  try {
    sources = await listSourcesWithCounts();
  } catch {
    catalogFailed = true;
  }

  let candidates: SourceCandidate[] = [];
  let queueFailed = false;
  try {
    candidates = await listSuggested();
  } catch {
    queueFailed = true;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Sources
          </h1>
          <Link
            href="/feed"
            className="text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            ← Feed
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          {isOwner
            ? "The live catalog feeds the site. Add sources, ingest on demand, and vet new candidates through the rating queue."
            : "The live catalog feeds the site. Propose a source and rate the queue — the owner promotes the good ones."}
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-8 py-6">
        <section aria-label="Live catalog" className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-faint">Live catalog</h2>
          {isOwner ? <AddSourceForm /> : null}
          {catalogFailed ? (
            <p className="py-[var(--space-section)] text-center text-sm text-muted">
              Could not reach the database. Make sure Supabase is configured.
            </p>
          ) : (
            <SourceCatalog sources={sources} isOwner={isOwner} />
          )}
        </section>

        <section aria-label="Source discovery" className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-faint">
            Propose &amp; rate
          </h2>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-faint">Add one</p>
            <AddCandidateForm />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-faint">Paste a list</p>
            <ImportListForm />
          </div>

          <div className="mt-2 flex flex-col">
            <h3 className="text-xs uppercase tracking-[0.18em] text-faint">Rating queue</h3>
            {queueFailed ? (
              <p className="py-[var(--space-section)] text-center text-sm text-muted">
                Could not load the rating queue.
              </p>
            ) : candidates.length === 0 ? (
              <p className="py-[var(--space-section)] text-center text-sm text-muted">
                The queue is empty. Add a candidate above to get started.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {candidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Source management · Phase 2.4
      </footer>
    </div>
  );
}
