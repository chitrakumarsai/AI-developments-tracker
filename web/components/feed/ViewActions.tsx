"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ASK_SECTION_SLUG } from "@/lib/feed/categories";
import { feedHref } from "@/lib/feed/filterHref";

/**
 * Actions on a saved prompt-view's detail (v4 Slice B): Refresh re-runs the
 * search against the current corpus; Delete removes the view. Both hit the
 * owner-scoped product routes; on success we refresh (or navigate back to the
 * list). Buttons show a working state while their request is in flight.
 */
export function ViewActions({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "refresh" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "refresh" | "delete") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(
        kind === "refresh" ? `/api/products/${productId}/refresh` : `/api/products/${productId}`,
        { method: kind === "refresh" ? "POST" : "DELETE" },
      );
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);
      if (kind === "delete") {
        router.push(feedHref({ section: ASK_SECTION_SLUG }));
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] border px-3 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => run("refresh")}
        disabled={busy !== null}
        className={`${btn} border-rule text-muted hover:border-accent hover:text-accent`}
      >
        {busy === "refresh" ? "Refreshing…" : "↻ Refresh"}
      </button>
      <button
        type="button"
        onClick={() => run("delete")}
        disabled={busy !== null}
        className={`${btn} border-rule text-muted hover:border-red-500 hover:text-red-600`}
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
