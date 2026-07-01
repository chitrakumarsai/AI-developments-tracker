import type { ItemRow } from "@/lib/supabase/types";
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

type ItemCardProps = {
  item: ItemRow;
};

/**
 * Editorial-list feed card: category eyebrow, title (links to source), an
 * expandable abstract, and an author · date / read affordance. Link-first —
 * the title and "Read" both open the original at the source.
 */
export function ItemCard({ item }: ItemCardProps) {
  return (
    <article className="border-b border-rule py-5">
      <p className="text-xs uppercase tracking-[0.18em] text-accent">
        {item.category}
      </p>

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
          {item.author ?? "Unknown"} · {formatRelative(item.published_at)}
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
