"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { SourceCandidate } from "@/lib/candidates/persist";

type IngestionType = "rss" | "api" | "scrape" | "manual";

const CATEGORIES = [
  "Research Papers",
  "GitHub Repositories",
  "LLM & Other Models",
  "Companies & Labs",
  "Newsletters & Blogs",
  "Social / Discussion",
  "Video & Podcasts",
  "Products & Tools",
];

/**
 * One row in the rating queue: shows the proposal, lets the user skip/keep/star
 * it, and — once decided — promote it. Promote posts to the validating route;
 * an unreachable/unsafe feed comes back 422 and its reason is shown inline
 * without creating a source.
 */
export function CandidateCard({ candidate }: { candidate: SourceCandidate }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[4]);
  const [ingestionType, setIngestionType] = useState<IngestionType>("rss");

  async function review(body: Record<string, unknown>) {
    setBusy(true);
    setReason(null);
    try {
      const res = await fetch("/api/candidates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id, ...body }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      router.refresh();
    } catch {
      setReason("Couldn’t save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function promote(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setReason(null);
    try {
      const res = await fetch("/api/candidates/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          name: name.trim(),
          category,
          ingestionType,
          tags: [],
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setReason(json?.error ?? `Promote failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setReason("Couldn’t reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50";
  const field =
    "min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent";

  return (
    <li className="border-b border-rule py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">
            {candidate.platform}
            {candidate.rating != null ? (
              <span className="ml-2 text-faint">rated {candidate.rating}/5</span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-sm text-ink">{candidate.handle_or_url}</p>
          {candidate.why_suggested ? (
            <p className="mt-1 text-sm text-muted">{candidate.why_suggested}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => review({ action: "skip" })} className={btn}>
          Skip
        </button>
        <button type="button" disabled={busy} onClick={() => review({ action: "rate", rating: 3 })} className={btn}>
          Keep
        </button>
        <button type="button" disabled={busy} onClick={() => review({ action: "rate", rating: 5 })} className={btn}>
          ⭐ Top
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowPromote((v) => !v)}
          className={`${btn} border-accent text-accent`}
        >
          Promote…
        </button>
      </div>

      {showPromote ? (
        <form onSubmit={promote} className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`name-${candidate.id}`}>
            Source name
          </label>
          <input
            id={`name-${candidate.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Source name"
            maxLength={120}
            className={`${field} min-w-0 flex-1`}
          />
          <label className="sr-only" htmlFor={`cat-${candidate.id}`}>
            Category
          </label>
          <select
            id={`cat-${candidate.id}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={field}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`type-${candidate.id}`}>
            Ingestion type
          </label>
          <select
            id={`type-${candidate.id}`}
            value={ingestionType}
            onChange={(e) => setIngestionType(e.target.value as IngestionType)}
            className={field}
          >
            <option value="rss">RSS</option>
            <option value="manual">Manual</option>
          </select>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Validate &amp; promote
          </button>
        </form>
      ) : null}

      {reason ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {reason}
        </p>
      ) : null}
    </li>
  );
}
