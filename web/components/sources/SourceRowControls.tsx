"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SOURCE_CATEGORIES } from "@/lib/sources/categories";
import { IngestButton } from "./IngestButton";

/** The mutable slice of a source the row controls need. */
type ControlledSource = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  status: string;
  priority: number;
};

type SourceRowControlsProps = {
  source: ControlledSource;
};

const MIN_PRIORITY = 0;
const MAX_PRIORITY = 100;

const smallBtn =
  "inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-3 text-xs font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50";
const field =
  "min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent";

/**
 * Owner-only inline controls for one catalog row (2.4.2): pause/resume,
 * re-weight priority, archive/restore, edit metadata, and ingest-now. Every
 * action PATCHes /api/sources/[id] (owner-gated server-side) and refreshes the
 * route so the row reflects the new state. `url` is not editable here.
 */
export function SourceRowControls({ source }: SourceRowControlsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(source.name);
  const [category, setCategory] = useState(source.category);
  const [tags, setTags] = useState(source.tags.join(", "));

  const isArchived = source.status === "archived";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      // Row disappears on refresh; no local state to reset.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    void patch({
      name: name.trim(),
      category,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  if (isArchived) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => patch({ status: "active" })}
          disabled={busy}
          className={smallBtn}
        >
          Restore
        </button>

        {confirmingDelete ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-muted">Delete forever?</span>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-red-600 px-3 text-xs font-medium uppercase tracking-[0.14em] text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className={smallBtn}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-3 text-xs font-medium uppercase tracking-[0.14em] text-muted transition-colors hover:border-red-600 hover:text-red-600 disabled:opacity-50"
          >
            Delete…
          </button>
        )}

        {error ? (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <IngestButton sourceId={source.id} />

        <button
          type="button"
          onClick={() =>
            patch({ status: source.status === "active" ? "paused" : "active" })
          }
          disabled={busy}
          className={smallBtn}
        >
          {source.status === "active" ? "Pause" : "Resume"}
        </button>

        <div className="inline-flex items-center gap-1" aria-label="Re-weight priority">
          <button
            type="button"
            onClick={() => patch({ priority: Math.max(MIN_PRIORITY, source.priority - 1) })}
            disabled={busy || source.priority <= MIN_PRIORITY}
            className={smallBtn}
            aria-label="Lower priority"
          >
            −
          </button>
          <span className="min-w-8 text-center text-xs tabular-nums text-muted">
            {source.priority}
          </span>
          <button
            type="button"
            onClick={() => patch({ priority: Math.min(MAX_PRIORITY, source.priority + 1) })}
            disabled={busy || source.priority >= MAX_PRIORITY}
            className={smallBtn}
            aria-label="Raise priority"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          className={smallBtn}
          aria-expanded={editing}
        >
          {editing ? "Cancel" : "Edit"}
        </button>

        <button
          type="button"
          onClick={() => patch({ status: "archived" })}
          disabled={busy}
          className={smallBtn}
        >
          Archive
        </button>

        {error ? (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        ) : null}
      </div>

      {editing ? (
        <form
          onSubmit={saveEdit}
          className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] border border-rule p-3"
        >
          <label className="sr-only" htmlFor={`edit-name-${source.id}`}>
            Name
          </label>
          <input
            id={`edit-name-${source.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Name"
            className={field}
          />
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor={`edit-category-${source.id}`}>
              Category
            </label>
            <select
              id={`edit-category-${source.id}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${field} min-w-0 flex-1`}
            >
              {/* Include the current value even if it predates the taxonomy. */}
              {!SOURCE_CATEGORIES.includes(category as (typeof SOURCE_CATEGORIES)[number]) ? (
                <option value={category}>{category}</option>
              ) : null}
              {SOURCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`edit-tags-${source.id}`}>
              Tags
            </label>
            <input
              id={`edit-tags-${source.id}`}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              maxLength={200}
              placeholder="tags, comma-separated"
              className={`${field} min-w-0 flex-1`}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
