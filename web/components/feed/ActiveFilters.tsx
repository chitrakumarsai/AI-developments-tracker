import Link from "next/link";

import { feedHref, type FeedHrefParams } from "@/lib/feed/filterHref";

type ActiveFiltersProps = {
  /** Current filter state, used to build the "drop one param" links. */
  context: FeedHrefParams;
  /** Human label for the active source (resolved from loaded items). */
  sourceLabel?: string | null;
};

const PILL =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 font-medium transition-colors";

/**
 * The pill row shown above the feed when a source and/or tag filter is active.
 * Each pill's tap target clears exactly that one filter (preserving the rest and
 * resetting paging); "Clear all" drops both. Nothing renders when unfiltered.
 */
export function ActiveFilters({ context, sourceLabel }: ActiveFiltersProps) {
  const hasSource = Boolean(context.source);
  const hasTag = Boolean(context.tag);
  if (!hasSource && !hasTag) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 pt-4 text-xs"
      aria-label="Active filters"
    >
      <span className="text-faint">Filtered to</span>

      {hasSource ? (
        <Link
          href={feedHref({ ...context, source: null, show: null })}
          aria-label={`Clear source filter${sourceLabel ? `: ${sourceLabel}` : ""}`}
          className={`${PILL} bg-accent/10 text-accent hover:bg-accent/20`}
        >
          {sourceLabel ?? "This source"}
          <span aria-hidden="true">×</span>
        </Link>
      ) : null}

      {hasTag ? (
        <Link
          href={feedHref({ ...context, tag: null, show: null })}
          aria-label={`Clear tag filter: ${context.tag}`}
          className={`${PILL} bg-rule/60 text-muted hover:text-ink`}
        >
          #{context.tag}
          <span aria-hidden="true">×</span>
        </Link>
      ) : null}

      <Link
        href={feedHref({
          section: context.section,
          sort: context.sort,
          window: context.window,
        })}
        className="inline-flex min-h-[36px] items-center text-faint underline-offset-2 hover:text-ink hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
