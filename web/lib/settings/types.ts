/**
 * App-wide feed settings (app-feedback-v3). Client-safe value types + defaults,
 * kept off the `server-only` persist module so the settings form and the feed
 * can both import them.
 *
 * Phase 1: a single global settings object. Phase 2 makes it per-user (add
 * user_id + RLS) — the shape stays the same.
 */

export type AppSettings = {
  /** Max items each source may show per day; null = unlimited. */
  topPerSourceDay: number | null;
  /** Keep only items matching ANY of these words (empty = no include filter). */
  includeKeywords: string[];
  /** Drop items matching ANY of these words. */
  excludeKeywords: string[];
  /** Hide items whose popularity metric is below this; null = no floor. */
  minMetric: number | null;
};

/** Sensible defaults — cap 10/source/day to keep the feed uncrowded. */
export const DEFAULT_SETTINGS: AppSettings = {
  topPerSourceDay: 10,
  includeKeywords: [],
  excludeKeywords: [],
  minMetric: null,
};

/** Bounds so a hostile/typo value can't break the feed query. */
export const MAX_TOP_PER_SOURCE_DAY = 100;
export const MAX_KEYWORDS = 40;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_MIN_METRIC = 1_000_000;
