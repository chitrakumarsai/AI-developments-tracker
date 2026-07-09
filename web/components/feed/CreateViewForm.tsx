"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Create a saved prompt-view (v4 Slice B): a title + a natural-language prompt.
 * POSTs to /api/products, which embeds the prompt, retrieves + reranks matching
 * items, and stores the snapshot. On success the list refreshes so the new view
 * appears. The search runs server-side (embedding + LLM), so the button shows a
 * working state while it's in flight.
 */
export function CreateViewForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedTitle || !trimmedPrompt) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, prompt: trimmedPrompt }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      setTitle("");
      setPrompt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the view.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "min-h-[44px] w-full rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-rule p-4"
    >
      <label className="sr-only" htmlFor="view-title">
        View title
      </label>
      <input
        id="view-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title — e.g. “Local-LLM inference”"
        maxLength={120}
        className={field}
      />
      <label className="sr-only" htmlFor="view-prompt">
        What are you looking for?
      </label>
      <textarea
        id="view-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what you want to track, in plain language — e.g. “efficient inference on consumer GPUs”"
        maxLength={500}
        rows={2}
        className={`${field} py-2 leading-relaxed`}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !title.trim() || !prompt.trim()}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Searching…" : "Create view"}
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
