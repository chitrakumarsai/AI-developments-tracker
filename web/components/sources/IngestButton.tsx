"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IngestButtonProps = {
  sourceId: string;
};

type RunResult = {
  added: number;
  perSource: Array<{ added: number; skipped: number }>;
};

/**
 * Owner-only "Ingest now" control (2.4.2). Awaits the single-source ingest run
 * and reports the outcome inline (`Pulled N items · M new`) via an aria-live
 * region, then refreshes the route so `last_fetched` and the item count update.
 * The endpoint is owner-gated server-side; this button is just the trigger.
 */
export function IngestButton({ sourceId }: IngestButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ingest() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}/ingest`, { method: "POST" });
      const json = (await res.json()) as { success: boolean; data: RunResult; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Ingest failed (${res.status})`);
      }
      const pulled = json.data.perSource.reduce((n, s) => n + s.added + s.skipped, 0);
      setResult(`Pulled ${pulled} item${pulled === 1 ? "" : "s"} · ${json.data.added} new`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={ingest}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-3 text-xs font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? "Ingesting…" : "Ingest now"}
      </button>
      <span aria-live="polite" className="text-xs">
        {result ? <span className="text-muted">{result}</span> : null}
        {error ? (
          <span role="alert" className="text-red-600">
            {error}
          </span>
        ) : null}
      </span>
    </div>
  );
}
