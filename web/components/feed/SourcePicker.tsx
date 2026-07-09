"use client";

import { useRouter } from "next/navigation";

import { sourceFilterHref, type FeedHrefParams } from "@/lib/feed/filterHref";

/** A `{ id, name }` option — mirrors `SourceOption` without the server-only import. */
export type SourcePickerOption = { id: string; name: string };

type SourcePickerProps = {
  /** Active sources to choose from (alphabetized upstream). */
  sources: readonly SourcePickerOption[];
  /** Current feed filter context — preserved when the source changes. */
  current: FeedHrefParams;
  /** The currently-selected source id, if the feed is source-filtered. */
  activeSource?: string | null;
};

/**
 * Feed source-picker (v4 findability): jump straight to a source's items —
 * especially a just-ingested feed — without scrolling or visiting /sources.
 * Selecting a source navigates to it at the all-time window (older items show);
 * "All sources" clears the filter. Logic lives in `sourceFilterHref` (unit-
 * tested); this is the thin control that wires it to router navigation.
 */
export function SourcePicker({ sources, current, activeSource }: SourcePickerProps) {
  const router = useRouter();

  if (sources.length === 0) return null;

  const isActive = Boolean(activeSource);

  return (
    <div className="flex items-center gap-1" aria-label="Source filter">
      <span className="mr-1 text-faint">Source</span>
      <div className="relative inline-flex items-center">
        <select
          value={activeSource ?? ""}
          onChange={(event) => router.push(sourceFilterHref(current, event.target.value))}
          aria-label="Filter the feed by source"
          className={`min-h-[36px] max-w-[11rem] cursor-pointer appearance-none truncate rounded-[var(--radius-sm)] border bg-transparent pl-2.5 pr-7 text-sm font-medium transition-colors focus:border-accent focus:outline-none ${
            isActive
              ? "border-accent text-ink"
              : "border-rule text-muted hover:border-ink hover:text-ink"
          }`}
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className={`pointer-events-none absolute right-2.5 text-[0.65rem] ${
            isActive ? "text-accent" : "text-faint"
          }`}
        >
          ▾
        </span>
      </div>
    </div>
  );
}
