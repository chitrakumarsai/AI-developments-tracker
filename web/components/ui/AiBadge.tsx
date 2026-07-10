/**
 * Marks a surface whose content a model produced or ordered.
 *
 * Used in exactly three places, and deliberately nowhere else:
 *   · the Ask tab      — embeddings + gpt-4o-mini rerank
 *   · the Digest card  — gpt-4o-mini writes the summary
 *   · a saved view's results — the reranker chose and ordered these items
 *
 * Feed titles and summaries come straight off the RSS feed, and `?q=` search is
 * a SQL substring match, so neither carries this badge. The glow has to *mean*
 * something: wherever it appears, a model was involved.
 *
 * `ai-surface` gives it a single shimmer pass on hover; at rest it is a static
 * gradient, and under `prefers-reduced-motion` it never animates at all.
 */
export function AiBadge({ label = "AI" }: { label?: string }) {
  return (
    <span
      className="ai-surface inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-ai-border bg-ai-soft px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
      title="Generated or ranked by a language model"
    >
      <span aria-hidden className="text-ai-to">
        &#10022;
      </span>
      <span className="ai-text">{label}</span>
    </span>
  );
}
