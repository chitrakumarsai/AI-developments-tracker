"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["RSS", "Blog", "Newsletter", "YouTube", "Reddit", "GitHub", "Other"];
const MAX_TEXT_LENGTH = 20_000;

/**
 * Paste a "who/what to follow" article or a bare list of feed URLs; the server
 * extracts every http(s) URL and adds the new ones to the rating queue in one
 * shot. URLs are validated for real only when a candidate is later promoted.
 */
export function ImportListForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const blob = text.trim();
    if (!blob) return;
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      const res = await fetch("/api/candidates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, text: blob }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { added: number; skipped: number };
      } | null;
      if (!res.ok || !json?.data) throw new Error(`Failed: ${res.status}`);
      setResult(json.data);
      setText("");
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
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4"
    >
      <label className="sr-only" htmlFor="import-platform">
        Platform for pasted links
      </label>
      <select
        id="import-platform"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
        className={`${field} self-start`}
      >
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="import-text">
        Paste a list or article
      </label>
      <textarea
        id="import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste an article or a list of feed URLs — every https:// link becomes a candidate."
        maxLength={MAX_TEXT_LENGTH}
        rows={5}
        className="min-h-[120px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          Extract &amp; queue
        </button>
        {result ? (
          <span role="status" className="text-xs text-muted">
            Added {result.added} · skipped {result.skipped}
            {result.added === 0 ? " (no new links found)" : " duplicate(s)"}
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            Couldn’t import — try again
          </span>
        ) : null}
      </div>
    </form>
  );
}
