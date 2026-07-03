import type { Connector } from "../types";
import { parseRssFeed } from "../rss/rss";
import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../net";

/**
 * arXiv connector — most-recent papers per category via the arXiv Atom API,
 * link-first (CLAUDE.md §7). Registered for host export.arxiv.org via the api
 * router.
 *
 * Why an API connector and not the generic RSS feed: a month-deep, recency-only
 * arXiv pull floods the feed (cs.LG alone posts hundreds/day). So this connector
 * asks the API for a hard-capped, submitted-date-descending slice per category
 * (§1.4 Slice B, GATE 1: ~50 most-recent/category). No popularity signal exists,
 * so `metric` stays null — arXiv ranks on recency alone (per preference).
 *
 * The API returns Atom XML, so parsing is delegated to the shared RSS/Atom path
 * (`parseRssFeed`) — DRY with the generic connector. Only the query shaping and
 * the fetch live here.
 */

/** Hard per-category cap so a busy category can't flood the feed (GATE 1). */
const MAX_RESULTS = 50;

/**
 * Build the arXiv API request URL from the source's configured `search_query`
 * (e.g. `cat:cs.AI`), forcing a submitted-date-descending sort and a hard result
 * cap so the connector always returns the most-recent, bounded slice.
 */
export function buildArxivQueryUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(MAX_RESULTS));
  return url.toString();
}

export const arxivConnector: Connector = async (source) => {
  // Guard the URL build too: a malformed source.url must warn, not throw, so one
  // bad source can't abort a multi-source run (§12.7).
  let requestUrl: string;
  try {
    requestUrl = buildArxivQueryUrl(source.url);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/atom+xml, application/xml" },
    });
    if (!response.ok) {
      return {
        sourceId: source.id,
        items: [],
        warnings: [`Fetch failed for ${source.name}: HTTP ${response.status}.`],
      };
    }
    const xml = await response.text();
    return await parseRssFeed(xml, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Fetch error for ${source.name}: ${message}.`],
    };
  } finally {
    clearTimeout(timeout);
  }
};
