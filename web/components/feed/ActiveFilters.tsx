import Link from "next/link";

import { feedHref, type FeedHrefParams } from "@/lib/feed/filterHref";

type ActiveFiltersProps = {
  /** Current filter state, used to build the "drop one param" links. */
  context: FeedHrefParams;
  /** Human label for the active source (resolved from loaded items). */
  sourceLabel?: string | null;
  /** Human label for the active platform (e.g. "GitHub"). */
  platformLabel?: string | null;
};

const PILL =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 font-medium transition-colors";

/** Human labels for the feedback/read-state pill. */
const STATE_LABELS: Record<string, string> = {
  unread: "Unread",
  liked: "Liked",
  "hide-down": "Hiding 👎",
};

/**
 * The pill row shown above the feed when a source and/or tag filter is active.
 * Each pill's tap target clears exactly that one filter (preserving the rest and
 * resetting paging); "Clear all" drops both. Nothing renders when unfiltered.
 */
export function ActiveFilters({ context, sourceLabel, platformLabel }: ActiveFiltersProps) {
  const hasSource = Boolean(context.source);
  const hasPlatform = Boolean(context.platform);
  const hasTag = Boolean(context.tag);
  const hasQuery = Boolean(context.q);
  const hasState = Boolean(context.state);
  if (!hasSource && !hasPlatform && !hasTag && !hasQuery && !hasState) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 pt-4 text-xs"
      aria-label="Active filters"
    >
      <span className="text-faint">Filtered to</span>

      {hasQuery ? (
        <Link
          href={feedHref({ ...context, q: null, show: null })}
          aria-label={`Clear search: ${context.q}`}
          className={`${PILL} bg-accent/10 text-accent hover:bg-accent/20`}
        >
          “{context.q}”
          <span aria-hidden="true">×</span>
        </Link>
      ) : null}

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

      {hasPlatform ? (
        <Link
          href={feedHref({ ...context, platform: null, show: null })}
          aria-label={`Clear platform filter${platformLabel ? `: ${platformLabel}` : ""}`}
          className={`${PILL} bg-accent/10 text-accent hover:bg-accent/20`}
        >
          {platformLabel ?? context.platform}
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

      {hasState && context.state ? (
        <Link
          href={feedHref({ ...context, state: null, show: null })}
          aria-label={`Clear ${STATE_LABELS[context.state] ?? context.state} filter`}
          className={`${PILL} bg-rule/60 text-muted hover:text-ink`}
        >
          {STATE_LABELS[context.state] ?? context.state}
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
