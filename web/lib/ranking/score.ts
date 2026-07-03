/**
 * Feed ranking — recency + popularity (subphase 1.4, app-feedback-v2).
 *
 * The reader is overwhelmed by an undifferentiated, source-grouped scroll. This
 * scores every item so the feed can surface "what matters right now" and
 * interleave sources into one ranked list.
 *
 *   rankScore = RECENCY_WEIGHT·recency + POPULARITY_WEIGHT·popularity   (both ∈ [0,1])
 *
 * Popularity is normalized PER SOURCE (log-scaled) so a repo's 12k stars and a
 * subreddit's 400 upvotes compete fairly instead of stars dominating. Sources
 * with no numeric metric yet (arXiv, Reddit/HN until slice B) score purely on
 * recency — they still place, just without a popularity boost.
 *
 * Pure and deterministic: `now` is injected so tests are stable.
 */

export const RECENCY_WEIGHT = 0.5;
export const POPULARITY_WEIGHT = 0.5;

const MS_PER_DAY = 86_400_000;

/**
 * Recency ∈ [0,1]: 1.0 for "now", decaying linearly to 0 at the window edge.
 * Undated or beyond-window items score 0 (they rank last on recency alone).
 */
export function recencyScore(
  publishedAt: string | null | undefined,
  now: number,
  windowDays: number,
): number {
  if (!publishedAt) return 0;
  const then = new Date(publishedAt).getTime();
  if (Number.isNaN(then)) return 0;
  const ageDays = (now - then) / MS_PER_DAY;
  if (ageDays <= 0) return 1; // published now or (clock skew) in the future
  if (windowDays <= 0) return 0;
  const remaining = 1 - ageDays / windowDays;
  return remaining > 0 ? remaining : 0;
}

/**
 * Popularity ∈ [0,1], log-scaled and normalized to the busiest item of the same
 * source. `sourceMax` is the max metric among that item's source in the pool.
 * Null/zero metric or a zero/absent max → 0 (no popularity signal).
 */
export function popularityScore(
  metric: number | null | undefined,
  sourceMax: number | null | undefined,
): number {
  if (typeof metric !== "number" || metric <= 0) return 0;
  if (typeof sourceMax !== "number" || sourceMax <= 0) return 0;
  const value = Math.log1p(metric);
  const max = Math.log1p(sourceMax);
  if (max <= 0) return 0;
  const ratio = value / max;
  return ratio > 1 ? 1 : ratio;
}

/** Combined rank score ∈ [0,1]. */
export function rankScore(recency: number, popularity: number): number {
  return RECENCY_WEIGHT * recency + POPULARITY_WEIGHT * popularity;
}

/** Minimal shape the ranker needs from a row. */
export type RankableItem = {
  source_id: string;
  metric: number | null;
  /** Second additive popularity signal (GitHub forks); absent → +0. */
  forks?: number | null;
  published_at: string | null;
};

/**
 * Effective popularity for ranking: `metric + forks` (each treated as 0 when
 * absent/negative). GitHub gets a fork boost on top of stars; every other source
 * has no forks, so this equals `metric`. Returns null when there is no signal at
 * all, so `popularityScore` scores it 0.
 */
function effectiveMetric(item: RankableItem): number | null {
  const stars = typeof item.metric === "number" && item.metric > 0 ? item.metric : 0;
  const forks = typeof item.forks === "number" && item.forks > 0 ? item.forks : 0;
  const total = stars + forks;
  return total > 0 ? total : null;
}

/**
 * Rank a pool of items by recency + per-source-normalized popularity, newest and
 * most-popular first. Stable: ties keep input order. Does not mutate the input.
 */
export function rankItems<T extends RankableItem>(
  items: readonly T[],
  now: number,
  windowDays: number,
): T[] {
  // Per-source max effective popularity, computed over the pool for fair
  // normalization (stars + forks for GitHub, plain metric elsewhere).
  const sourceMax = new Map<string, number>();
  for (const item of items) {
    const value = effectiveMetric(item);
    if (value !== null) {
      const current = sourceMax.get(item.source_id) ?? 0;
      if (value > current) sourceMax.set(item.source_id, value);
    }
  }

  return items
    .map((item, index) => {
      const recency = recencyScore(item.published_at, now, windowDays);
      const popularity = popularityScore(effectiveMetric(item), sourceMax.get(item.source_id));
      return { item, index, score: rankScore(recency, popularity) };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((ranked) => ranked.item);
}
