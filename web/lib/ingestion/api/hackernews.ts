import type { Connector, IngestionResult, NormalizedItem, SourceRef } from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import { FETCH_TIMEOUT_MS, safeFetch, unsafeUrlReason, USER_AGENT } from "../net";

/**
 * Hacker News connector — AI-filtered high-score stories via the Algolia HN
 * Search API, link-first (CLAUDE.md §7). Keyless (no token). Follows the house
 * connector pattern (see github.ts/huggingface.ts): pure mapper split from I/O,
 * sanitizes untrusted fields, warns-not-throws. Registered for host
 * hn.algolia.com via the api router.
 *
 * Link-first rule: use the story's external `url`; for text posts (Ask/Show HN)
 * with no url, fall back to the HN discussion page for that objectID.
 *
 * High-score gate: HN's Algolia index only allows `numericFilters` on
 * `created_at_i` — filtering by `points`/`num_comments` returns HTTP 400
 * ("attribute not specified in numericAttributesForFiltering"). So the
 * "high-score" threshold is enforced here in the connector, not in the query.
 * The default relevance ranking is already points-weighted, so this mostly
 * guards niche queries whose top matches are low-score.
 *
 * Recency window (§1.4 Slice B): `created_at_i` IS filterable, so the connector
 * injects a rolling 30-day lower bound at request time. Points are stored as the
 * item `metric` so the ranker can normalize HN popularity per source.
 */

const MAX_ITEMS = 50;
const MIN_POINTS = 100;
const WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const HN_ITEM_BASE = "https://news.ycombinator.com/item?id=";

type HnHit = {
  objectID?: string;
  title?: string;
  url?: string | null;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
};

type HnSearchResponse = { hits?: HnHit[] };

/** Pure mapping — network-free, fixture-testable. */
export function parseHnSearch(json: HnSearchResponse, source: SourceRef): IngestionResult {
  const warnings: string[] = [];
  const items: NormalizedItem[] = [];

  for (const hit of (json.hits ?? []).slice(0, MAX_ITEMS)) {
    // High-score gate (see file header): intentional selection, not a data
    // problem, so filtered-out low-score stories are dropped without a warning.
    const points = typeof hit.points === "number" ? hit.points : 0;
    if (points < MIN_POINTS) continue;

    const title = sanitizeText(hit.title);
    if (!title) {
      warnings.push(`Skipped HN story with missing title (id: ${hit.objectID || "none"}).`);
      continue;
    }
    const external = sanitizeUrl(hit.url);
    const fallback = hit.objectID ? sanitizeUrl(`${HN_ITEM_BASE}${hit.objectID}`) : "";
    const url = external || fallback;
    if (!url) {
      warnings.push(`Skipped HN story with no usable url (title: ${title}).`);
      continue;
    }
    const summaryParts = [
      typeof hit.points === "number" ? `${hit.points} points` : null,
      typeof hit.num_comments === "number" ? `${hit.num_comments} comments` : null,
    ].filter(Boolean);
    items.push({
      title,
      url,
      category: source.category,
      summary: summaryParts.length ? summaryParts.join(" · ") : undefined,
      author: sanitizeText(hit.author) || undefined,
      publishedAt: hit.created_at,
      tags: source.tags,
      metric: points,
    });
  }

  return { sourceId: source.id, items, warnings };
}

/**
 * Build the Algolia request URL from the source's configured query, injecting a
 * rolling `created_at_i>` lower bound so each run only pulls the last 30 days.
 * `now` is injectable for deterministic tests.
 */
export function buildHnSearchUrl(sourceUrl: string, now: number = Date.now()): string {
  const url = new URL(sourceUrl);
  const sinceSeconds = Math.floor((now - WINDOW_DAYS * MS_PER_DAY) / 1000);
  url.searchParams.set("numericFilters", `created_at_i>${sinceSeconds}`);
  return url.toString();
}

export const hackernewsConnector: Connector = async (source) => {
  // Guard the URL build too: a malformed source.url must warn, not throw, so one
  // bad source can't abort a multi-source run (§12.7).
  let requestUrl: string;
  try {
    requestUrl = buildHnSearchUrl(source.url);
  } catch {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Refusing to fetch ${source.name}: invalid source URL.`],
    };
  }
  const unsafeReason = unsafeUrlReason(requestUrl);
  if (unsafeReason) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Refusing to fetch ${source.name}: ${unsafeReason}.`],
    };
  }

  const warnings: string[] = [];
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "application/json",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await safeFetch(requestUrl, { signal: controller.signal, headers });
    if (!response.ok) {
      warnings.push(`Fetch failed for ${source.name}: HTTP ${response.status}.`);
      return { sourceId: source.id, items: [], warnings };
    }
    const json = (await response.json()) as HnSearchResponse;
    const parsed = parseHnSearch(json, source);
    return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    warnings.push(`Fetch error for ${source.name}: ${message}.`);
    return { sourceId: source.id, items: [], warnings };
  } finally {
    clearTimeout(timeout);
  }
};
