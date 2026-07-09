"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SOURCE_CATEGORIES, INGESTION_TYPES } from "@/lib/sources/categories";

/**
 * Owner-only "Add a source" form (2.4.2). Posts to /api/sources, where the feed
 * is SSRF-checked and RSS-parsed BEFORE any write — so a bad URL comes back as a
 * readable reason (422) and nothing is created. On success the row is cleared and
 * the route refreshed so the new source appears in the catalog.
 */
export function AddSourceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>(SOURCE_CATEGORIES[0]);
  const [ingestionType, setIngestionType] = useState<string>(INGESTION_TYPES[0]);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          url: trimmedUrl,
          category,
          ingestionType,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      setName("");
      setUrl("");
      setTags("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the source");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-rule p-4"
    >
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="src-name">
          Source name
        </label>
        <input
          id="src-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Source name"
          maxLength={120}
          className={`${field} min-w-0 flex-1`}
        />
        <label className="sr-only" htmlFor="src-type">
          Ingestion type
        </label>
        <select
          id="src-type"
          value={ingestionType}
          onChange={(e) => setIngestionType(e.target.value)}
          className={field}
        >
          {INGESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <label className="sr-only" htmlFor="src-url">
        Feed URL
      </label>
      <input
        id="src-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Feed URL (https://…/feed.xml)"
        maxLength={500}
        className={field}
      />

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="src-category">
          Category
        </label>
        <select
          id="src-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${field} min-w-0 flex-1`}
        >
          {SOURCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="src-tags">
          Tags
        </label>
        <input
          id="src-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma-separated"
          maxLength={200}
          className={`${field} min-w-0 flex-1`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !name.trim() || !url.trim()}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Validating…" : "Add source"}
        </button>
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
