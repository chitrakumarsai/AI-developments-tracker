import type { ItemRow } from "@/lib/supabase/types";
import { platformForItem } from "@/lib/feed/platform";
import { Abstract } from "./Abstract";

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

/** GitHub repos count stars; Hugging Face models count likes — label the metric per category. */
function metricLabel(category: string): string {
  return category === "GitHub Repositories" ? "stars" : "likes";
}

type ItemCardProps = {
  item: ItemRow;
};

/**
 * Editorial-list feed card: category eyebrow, title (links to source), an
 * expandable abstract, and an author · date / read affordance. Link-first —
 * the title and "Read" both open the original at the source.
 */
export function ItemCard({ item }: ItemCardProps) {
  const platform = platformForItem(item);
  return (
    <article className="border-b border-rule py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent">
          <span className="inline-flex shrink-0 items-center rounded-[var(--radius-sm)] bg-accent/10 px-1.5 py-0.5 font-semibold not-italic tracking-normal text-accent">
            {platform.label}
          </span>
          <span className="truncate text-faint">{item.category}</span>
        </p>
        {item.metric != null ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rule/50 px-2 py-0.5 text-xs font-medium text-muted"
            aria-label={`${METRIC_NUMBER.format(item.metric)} ${metricLabel(item.category)}`}
          >
            <span aria-hidden="true" className="text-accent">
              ★
            </span>
            {METRIC_NUMBER.format(item.metric)}
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 font-display text-lg leading-snug text-ink">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-accent"
        >
          {item.title}
        </a>
      </h2>

      {item.summary ? <Abstract text={item.summary} /> : null}

      <div className="mt-3 flex items-center justify-between text-xs text-faint">
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
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open “${item.title}” at the source`}
          className="inline-flex min-h-[44px] shrink-0 items-center font-medium text-muted transition-colors hover:text-accent"
        >
          Read&nbsp;&rarr;
        </a>
      </div>
    </article>
  );
}
