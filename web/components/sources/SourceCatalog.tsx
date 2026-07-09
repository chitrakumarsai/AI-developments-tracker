import type { SourceWithCount } from "@/lib/sources/persist";
import { SourceRowControls } from "./SourceRowControls";

type SourceCatalogProps = {
  sources: SourceWithCount[];
  isOwner: boolean;
};

const RELATIVE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatFetched(iso: string | null): string {
  if (!iso) return "never";
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? "never" : RELATIVE.format(when);
}

/** Small semantic status pill — active reads as live, others recede. */
function statusTone(status: string): string {
  if (status === "active") return "border-accent text-accent";
  if (status === "paused") return "border-rule text-muted";
  return "border-rule text-faint";
}

/**
 * Read-only catalog of live sources (2.4.2). Every signed-in user sees the list;
 * only the owner gets the per-row "Ingest now" trigger. All fields are plain
 * text (React-escaped) — source names/categories/tags are owner-authored and
 * sanitized on write, so rendering them here is XSS-safe.
 */
export function SourceCatalog({ sources, isOwner }: SourceCatalogProps) {
  if (sources.length === 0) {
    return (
      <p className="py-[var(--space-section)] text-center text-sm text-muted">
        No sources in the catalog yet. Add one above to start ingesting.
      </p>
    );
  }

  return (
    <ul className="mt-2 flex flex-col">
      {sources.map((source) => (
        <li
          key={source.id}
          className="flex flex-col gap-2 border-t border-rule py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-medium text-ink">{source.name}</h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${statusTone(source.status)}`}
              >
                {source.status}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.12em] text-faint">
              <span>{source.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{source.itemCount} items</span>
              <span aria-hidden="true">·</span>
              <span>fetched {formatFetched(source.last_fetched)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">priority {source.priority}</span>
            </p>
          </div>
          {isOwner ? (
            <SourceRowControls
              source={{
                id: source.id,
                name: source.name,
                category: source.category,
                tags: source.tags,
                status: source.status,
                priority: source.priority,
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
