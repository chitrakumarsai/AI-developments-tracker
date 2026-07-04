/**
 * Normalize untrusted settings input into a safe `AppSettings` (§12.7).
 *
 * The settings form and API body are untrusted: clamp numbers into range, drop
 * junk keywords, lowercase + dedupe + cap the keyword lists. Pure and
 * client-safe so the route and tests can both use it.
 */

import {
  DEFAULT_SETTINGS,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_MIN_METRIC,
  MAX_TOP_PER_SOURCE_DAY,
  type AppSettings,
} from "./types";

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const kw = raw.trim().toLowerCase().slice(0, MAX_KEYWORD_LENGTH);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** null-or-undefined → null (unlimited/no-floor); a number is clamped into [min,max]. */
function clampNullableInt(value: unknown, min: number, max: number): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n < min) return null;
  return Math.min(n, max);
}

export function normalizeSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  return {
    topPerSourceDay: clampNullableInt(r.topPerSourceDay, 1, MAX_TOP_PER_SOURCE_DAY),
    includeKeywords: cleanKeywords(r.includeKeywords),
    excludeKeywords: cleanKeywords(r.excludeKeywords),
    minMetric: clampNullableInt(r.minMetric, 0, MAX_MIN_METRIC),
  };
}
