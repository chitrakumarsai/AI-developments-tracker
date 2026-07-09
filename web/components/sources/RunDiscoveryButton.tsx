"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DiscoverySummary = {
  scannedSources: number;
  fetched: number;
  hostsFound: number;
  proposed: number;
  skipped: number;
  warnings: string[];
};

/**
 * Owner-only "Run discovery" trigger (2.4.3). Kicks off the outbound-link
 * analysis, awaits the summary, and reports it inline (`Proposed N · M already
 * known`), then refreshes so newly-suggested candidates show in the rating
 * queue below. The run can take a moment (it fetches external pages), so the
 * button stays disabled + labelled while it works.
 */
export function RunDiscoveryButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/discovery/run", { method: "POST" });
      const json = (await res.json()) as {
        success: boolean;
        data: DiscoverySummary;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Discovery failed (${res.status})`);
      }
      const { proposed, skipped, fetched } = json.data;
      setResult(
        `Proposed ${proposed} new · ${skipped} already known · scanned ${fetched} pages`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Discovering…" : "Run discovery"}
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
