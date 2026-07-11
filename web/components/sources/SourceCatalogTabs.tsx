"use client";

import { useMemo, useState } from "react";

import type { SourceWithCount } from "@/lib/sources/persist";
import type { SourceStatus } from "@/lib/supabase/types";
import {
  CATALOG_PAGE_SIZE,
  CATALOG_TABS,
  countByStatus,
  paginate,
  rowsForTab,
} from "@/lib/sources/catalogView";
import { SourceRow } from "./SourceRow";

type SourceCatalogTabsProps = {
  sources: SourceWithCount[];
  isOwner: boolean;
};

const TAB_LABEL: Record<SourceStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const tabBtn =
  "inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-xs font-medium uppercase tracking-[0.14em] transition-colors";

/**
 * Tabbed, searchable, paginated live catalog (2.4.3). Splits sources into
 * Active / Paused / Archived tabs so archived rows never sit in the active
 * scroll path, filters by name within a tab, and reveals rows a page at a time.
 * All derived state (counts, filtering, pagination) comes from the pure helpers
 * in `catalogView` — this component only owns the interaction state.
 */
export function SourceCatalogTabs({ sources, isOwner }: SourceCatalogTabsProps) {
  const [tab, setTab] = useState<SourceStatus>("active");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);

  const counts = useMemo(() => countByStatus(sources), [sources]);
  const matched = useMemo(
    () => rowsForTab(sources, tab, search),
    [sources, tab, search],
  );
  const page = paginate(matched, visible);

  function selectTab(next: SourceStatus) {
    setTab(next);
    setVisible(CATALOG_PAGE_SIZE);
  }

  function onSearch(next: string) {
    setSearch(next);
    setVisible(CATALOG_PAGE_SIZE);
  }

  if (sources.length === 0) {
    return (
      <p className="py-[var(--space-section)] text-center text-sm text-muted">
        No sources in the catalog yet. Add one above to start ingesting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Source status"
        className="flex flex-wrap gap-2"
      >
        {CATALOG_TABS.map((status) => {
          const selected = status === tab;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(status)}
              className={`${tabBtn} ${
                selected
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-rule text-muted hover:border-muted hover:text-ink"
              }`}
            >
              {TAB_LABEL[status]}
              <span className="tabular-nums text-faint">{counts[status]}</span>
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor="source-search">
        Search sources by name
      </label>
      <input
        id="source-search"
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search sources by name…"
        className="min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent"
      />

      {page.rows.length === 0 ? (
        <p className="py-[var(--space-section)] text-center text-sm text-muted">
          {search.trim()
            ? `No ${TAB_LABEL[tab].toLowerCase()} sources match “${search.trim()}”.`
            : `No ${TAB_LABEL[tab].toLowerCase()} sources.`}
        </p>
      ) : (
        <ul className="flex flex-col">
          {page.rows.map((source) => (
            <SourceRow key={source.id} source={source} isOwner={isOwner} />
          ))}
        </ul>
      )}

      {page.hasMore ? (
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            type="button"
            onClick={() => setVisible((v) => v + CATALOG_PAGE_SIZE)}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule px-4 text-xs font-medium uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Show more
          </button>
          <p className="text-xs text-faint">
            Showing {page.rows.length} of {page.total}
          </p>
        </div>
      ) : null}
    </div>
  );
}
