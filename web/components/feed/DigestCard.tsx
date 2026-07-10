import { getFeedItems } from "@/lib/feed/queries";
import { AiBadge } from "@/components/ui/AiBadge";
import { getDigest } from "@/lib/digest/digest";
import { parseDigest } from "@/lib/digest/parse";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import type { DigestPeriod } from "@/lib/digest/types";

/** Items sampled for the digest — the window's most relevant. */
const DIGEST_SAMPLE = 30;

const PERIOD_LABEL: Record<DigestPeriod, string> = {
  week: "This week in AI",
  month: "This month in AI",
};

/**
 * A collapsible LLM digest of the window's top items, shown above the feed for
 * the week/month views. Server-rendered and fails soft: any error (DB, no items,
 * LLM unavailable) renders nothing rather than breaking the feed.
 */
export async function DigestCard({ period }: { period: DigestPeriod }) {
  let content: string | null = null;
  try {
    // The digest is a shared, non-personalized summary (userId omitted), but it
    // reads through the anon/auth client so the feed render path never touches
    // service-role.
    const client = await createServerSupabaseClient();
    const items = await getFeedItems({ window: period, limit: DIGEST_SAMPLE }, client);
    content = await getDigest(items, period);
  } catch {
    return null;
  }
  if (!content) return null;

  const blocks = parseDigest(content);
  if (blocks.length === 0) return null;

  return (
    <details
      className="mt-4 rounded-[var(--radius-lg)] border border-ai-border bg-ai-soft px-4 py-3 shadow-card"
      open
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-medium text-ink">
        <AiBadge />
        {PERIOD_LABEL[period]}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {blocks.map((block, b) => (
          <div key={b} className="flex flex-col gap-1.5">
            {block.heading && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                {block.heading}
              </h3>
            )}
            <ul className="flex flex-col gap-1.5">
              {block.items.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <span aria-hidden="true" className="text-accent">
                    —
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
