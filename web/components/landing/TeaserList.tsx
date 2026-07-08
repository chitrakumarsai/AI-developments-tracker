import type { ItemRow } from "@/lib/supabase/types";

/**
 * Static, NON-INTERACTIVE preview of the latest headlines for the public landing
 * (2.4). Anonymous visitors can look but not act: every field is plain text —
 * no links, no feedback controls, no navigation. The only actionable elements on
 * the landing are Sign in / Create account. React escapes all text content, so
 * rendering ingested (untrusted) titles/summaries here is XSS-safe.
 */

const ABSOLUTE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? "" : ABSOLUTE_DATE.format(when);
}

/** Trim a summary to a short, single-line-ish snippet for the preview. */
function snippet(summary: string | null, max = 160): string | null {
  if (!summary) return null;
  const clean = summary.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

type TeaserListProps = {
  items: ItemRow[];
};

export function TeaserList({ items }: TeaserListProps) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-sm text-muted">
        Fresh signal is on its way — check back shortly.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule" aria-label="Latest headlines preview">
      {items.map((item, index) => {
        const date = formatDate(item.published_at);
        const sourceName = item.source?.name ?? null;
        const summary = snippet(item.summary);
        return (
          <li key={item.id} className="flex gap-4 py-5">
            <span
              aria-hidden="true"
              className="mt-0.5 font-display text-sm tabular-nums text-faint"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-medium leading-snug text-ink">
                {item.title}
              </h3>
              {summary ? (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                  {summary}
                </p>
              ) : null}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.14em] text-faint">
                {sourceName ? <span>{sourceName}</span> : null}
                {sourceName && date ? <span aria-hidden="true">·</span> : null}
                {date ? <time dateTime={item.published_at ?? undefined}>{date}</time> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
