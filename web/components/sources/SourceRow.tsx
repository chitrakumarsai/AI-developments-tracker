import Link from "next/link";

import type { SourceWithCount } from "@/lib/sources/persist";
import { feedHref } from "@/lib/feed/filterHref";
import { SourceRowControls } from "./SourceRowControls";

type SourceRowProps = {
  source: SourceWithCount;
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
 * One catalog row (presentational). All fields are plain text (React-escaped) —
 * source names/categories/tags are owner-authored and sanitized on write, so
 * rendering them here is XSS-safe. Owner-only controls (pause/archive/delete/
 * edit/ingest) render on the right via {@link SourceRowControls}.
 */
export function SourceRow({ source, isOwner }: SourceRowProps) {
  return (
    <li className="flex flex-col gap-2 border-t border-rule py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-medium text-ink">
            <Link
              href={feedHref({ source: source.id, window: "all" })}
              className="transition-colors hover:text-accent"
              aria-label={`View ${source.name} items in the feed`}
            >
              {source.name}
            </Link>
          </h3>
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
  );
}
