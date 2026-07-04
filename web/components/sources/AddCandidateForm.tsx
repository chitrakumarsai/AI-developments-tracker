"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["RSS", "Blog", "Newsletter", "YouTube", "Reddit", "GitHub", "Other"];

/**
 * Add a candidate source to the rating queue. Posts to /api/candidates and
 * refreshes so the new row appears. The URL is validated for real only when the
 * candidate is later promoted — here we just capture the proposal.
 */
export function AddCandidateForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [handleOrUrl, setHandleOrUrl] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = handleOrUrl.trim();
    if (!url) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          handleOrUrl: url,
          whySuggested: why.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setHandleOrUrl("");
      setWhy("");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="cand-platform">
          Platform
        </label>
        <select
          id="cand-platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={field}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="cand-url">
          Feed URL or handle
        </label>
        <input
          id="cand-url"
          value={handleOrUrl}
          onChange={(e) => setHandleOrUrl(e.target.value)}
          placeholder="Feed URL (https://…/feed.xml)"
          maxLength={500}
          className={`${field} min-w-0 flex-1`}
        />
      </div>
      <label className="sr-only" htmlFor="cand-why">
        Why follow this
      </label>
      <input
        id="cand-why"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why follow this? (optional)"
        maxLength={500}
        className={field}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !handleOrUrl.trim()}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          Add to queue
        </button>
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            Couldn’t add — try again
          </span>
        ) : null}
      </div>
    </form>
  );
}
