"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { viewToHref, type SavedFilters } from "@/lib/views/href";
import type { SavedView } from "@/lib/views/persist";

type SavedViewsBarProps = {
  views: SavedView[];
  /** The current filter set — offered for saving when any filter is active. */
  current: SavedFilters;
  hasActiveFilters: boolean;
};

const MAX_NAME = 80;

/**
 * The saved-views strip above the feed. Loading a view is a plain link (the URL
 * is the source of truth); saving and deleting go through the write routes and
 * then `router.refresh()` to re-fetch the list. Nothing renders when there are
 * no views and nothing to save.
 */
export function SavedViewsBar({ views, current, hasActiveFilters }: SavedViewsBarProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (views.length === 0 && !hasActiveFilters) return null;

  async function post(url: string, body: unknown): Promise<boolean> {
    setError(false);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await post("/api/views", { name: trimmed, filters: current })) {
      setName("");
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (await post("/api/views/delete", { id })) router.refresh();
  }

  return (
    <section aria-label="Saved views" className="flex flex-wrap items-center gap-2 pt-4 text-xs">
      {views.length > 0 ? <span className="text-faint">Views</span> : null}

      {views.map((view) => (
        <span
          key={view.id}
          className="inline-flex items-center overflow-hidden rounded-full bg-rule/50"
        >
          <Link
            href={viewToHref(view.filters)}
            className="inline-flex min-h-[36px] items-center pl-3 pr-2 font-medium text-muted transition-colors hover:text-ink"
          >
            {view.name}
          </Link>
          <button
            type="button"
            onClick={() => remove(view.id)}
            disabled={busy}
            aria-label={`Delete view: ${view.name}`}
            className="inline-flex min-h-[36px] min-w-[32px] items-center justify-center pr-2 text-faint transition-colors hover:text-ink disabled:opacity-50"
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}

      {hasActiveFilters ? (
        <form onSubmit={save} className="flex items-center gap-1">
          <label htmlFor="save-view-name" className="sr-only">
            Name this view
          </label>
          <input
            id="save-view-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this view…"
            maxLength={MAX_NAME}
            className="min-h-[36px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-2.5 text-ink placeholder:text-faint focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] border border-rule px-3 font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Save view
          </button>
        </form>
      ) : null}

      {error ? (
        <span role="alert" className="text-red-600">
          Couldn’t save
        </span>
      ) : null}
    </section>
  );
}
