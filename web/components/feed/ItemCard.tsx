import Link from "next/link";

import type { ItemRow } from "@/lib/supabase/types";
import { platformForItem } from "@/lib/feed/platform";
import { metricMeta } from "@/lib/feed/metric";
import { feedHref, type FeedHrefParams } from "@/lib/feed/filterHref";
import { Abstract } from "./Abstract";
import { FeedbackControls } from "./FeedbackControls";
import { OpenAtSourceLink } from "./OpenAtSourceLink";
import { ShareButton } from "./ShareButton";

/** Cap tag chips per card so a heavily-tagged item doesn't crowd the layout. */
const MAX_TAG_CHIPS = 4;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const APPROX_DAYS_PER_MONTH = 30; // display approximation only
const MONTHS_PER_YEAR = 12;

function formatRelative(iso: string | null): string {
  if (!iso) return "undated";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "undated";
  const days = Math.floor((Date.now() - then) / MS_PER_DAY);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < APPROX_DAYS_PER_MONTH) return `${days}d ago`;
  const months = Math.floor(days / APPROX_DAYS_PER_MONTH);
  if (months < MONTHS_PER_YEAR) return `${months}mo ago`;
  return `${Math.floor(months / MONTHS_PER_YEAR)}y ago`;
}

const ABSOLUTE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Absolute publish date, e.g. "1 Jul 2026" — so recency is judgeable at a glance. */
function formatAbsolute(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return ABSOLUTE_DATE.format(then);
}

const METRIC_NUMBER = new Intl.NumberFormat("en-US");

type ItemCardProps = {
  item: ItemRow;
  /** Current filter state, so source/tag links preserve section/sort/window. */
  context?: FeedHrefParams;
};

/**
 * Editorial-list feed card: category eyebrow, title (links to source), an
 * expandable abstract, tag chips, and an author · date / read affordance.
 * Link-first — the title and "Read" open the original at the source; the source
 * badge and tag chips are in-app filter links (they narrow the feed, not leave).
 */
export function ItemCard({ item, context = {} }: ItemCardProps) {
  const platform = platformForItem(item);
  const metric = item.metric != null ? metricMeta(platform.slug, item.category) : null;
  const tags = item.tags?.slice(0, MAX_TAG_CHIPS) ?? [];
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-[var(--radius-lg)] border border-rule bg-surface p-[var(--space-card)] shadow-card transition-shadow duration-[var(--duration-fast)] hover:shadow-raised">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs">
          <Link
            href={feedHref({ ...context, source: item.source_id, show: null })}
            aria-label={`Show only ${platform.label} items`}
            className="inline-flex shrink-0 items-center rounded-[var(--radius-pill)] bg-accent-soft px-2 py-0.5 font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink"
          >
            {platform.label}
          </Link>
          <span className="truncate text-faint">{item.category}</span>
        </p>
        {item.metric != null && metric ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] bg-sunken px-2 py-0.5 text-xs font-medium text-muted"
            aria-label={`${METRIC_NUMBER.format(item.metric)} ${metric.label}`}
          >
            <span aria-hidden="true" className="text-accent">
              {metric.icon}
            </span>
            {METRIC_NUMBER.format(item.metric)}
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 [overflow-wrap:anywhere] font-display text-lg leading-snug text-ink">
        <OpenAtSourceLink
          itemId={item.id}
          url={item.url}
          className="transition-colors hover:text-accent"
        >
          {item.title}
        </OpenAtSourceLink>
      </h2>

      {item.summary ? <Abstract text={item.summary} /> : null}

      {tags.length > 0 ? (
        <ul className="mb-3 mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag}>
              <Link
                href={feedHref({ ...context, tag, show: null })}
                aria-label={`Show only items tagged ${tag}`}
                className="inline-flex min-h-[36px] items-center rounded-[var(--radius-pill)] bg-sunken px-2.5 text-xs font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent"
              >
                #{tag}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-rule pt-3 text-xs text-faint">
        <span className="truncate pr-3">
          {item.author ?? "Unknown"}
          {item.published_at ? (
            <>
              {" · "}
              <time dateTime={item.published_at} className="text-muted">
                {formatAbsolute(item.published_at)}
              </time>{" "}
              <span className="text-faint">({formatRelative(item.published_at)})</span>
            </>
          ) : (
            <> · undated</>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <FeedbackControls itemId={item.id} initialValue={item.feedback_value} />
          <ShareButton
            url={item.url}
            title={item.title}
            className="inline-flex min-h-[44px] items-center font-medium text-muted transition-colors hover:text-accent"
          />
          <OpenAtSourceLink
            itemId={item.id}
            url={item.url}
            aria-label={`Open “${item.title}” at the source`}
            className="inline-flex min-h-[44px] items-center font-medium text-muted transition-colors hover:text-accent"
          >
            Read&nbsp;&rarr;
          </OpenAtSourceLink>
        </div>
      </div>
    </article>
  );
}
