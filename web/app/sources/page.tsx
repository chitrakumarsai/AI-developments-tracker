import Link from "next/link";

import { listSuggested, type SourceCandidate } from "@/lib/candidates/persist";
import { AddCandidateForm } from "@/components/sources/AddCandidateForm";
import { ImportListForm } from "@/components/sources/ImportListForm";
import { CandidateCard } from "@/components/sources/CandidateCard";

// Reflects live database state; render per-request.
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  let candidates: SourceCandidate[] = [];
  let failed = false;
  try {
    candidates = await listSuggested();
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Sources
          </h1>
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            ← Feed
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          Propose a source, rate the queue, and promote the good ones. Only promoted
          sources feed the site — a feed is validated before it goes live.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6 py-6">
        <section aria-label="Add a source" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-[0.18em] text-faint">Add one</h2>
            <AddCandidateForm />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-[0.18em] text-faint">Paste a list</h2>
            <ImportListForm />
          </div>
        </section>

        <section aria-label="Rating queue" className="flex flex-1 flex-col">
          <h2 className="text-xs uppercase tracking-[0.18em] text-faint">
            Rating queue
          </h2>
          {failed ? (
            <p className="py-[var(--space-section)] text-center text-sm text-muted">
              Could not reach the database. Make sure Supabase is configured.
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
        </section>
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Source onboarding · Phase 1
      </footer>
    </div>
  );
}
