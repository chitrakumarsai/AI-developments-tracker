import Parser from "rss-parser";

import type {
  Connector,
  IngestionResult,
  NormalizedItem,
  SourceRef,
} from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";

/**
 * Generic RSS/Atom connector — the link-first reference implementation
 * (CLAUDE.md §7). Handles any standard feed: arXiv category feeds, company/lab
 * blogs, newsletters, Reddit/YouTube RSS, etc. New RSS sources are added as
 * `sources` rows with `ingestion_type='rss'` — no new code (see registry.ts).
 */

/** Cap items stored per source per run (preference: latest 50). */
const MAX_ITEMS = 50;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "AIChronicles/0.1 (+https://github.com/ai-developments-tracker)";

type RssEntry = {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  isoDate?: string;
};

const parser = new Parser<unknown, RssEntry>();

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local / cloud metadata (IMDS)
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.local$/i,
];

/**
 * SSRF guard: a source URL must be http/https and must not point at a
 * private, loopback, or link-local host. Returns an error message if unsafe,
 * otherwise null. (CLAUDE.md §12.7 — source rows are untrusted once a UI can
 * add them.)
 */
function unsafeSourceUrlReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `disallowed scheme "${parsed.protocol}"`;
  }
  if (PRIVATE_HOST.some((pattern) => pattern.test(parsed.hostname))) {
    return `private/loopback host "${parsed.hostname}"`;
  }
  return null;
}

/**
 * Parse an RSS payload into normalized, sanitized items. Pure and
 * network-free so it can be tested against a saved fixture.
 */
export async function parseRssFeed(
  xml: string,
  source: SourceRef,
): Promise<IngestionResult> {
  const warnings: string[] = [];
  const feed = await parser.parseString(xml);
  const items: NormalizedItem[] = [];

  for (const entry of feed.items.slice(0, MAX_ITEMS)) {
    const title = sanitizeText(entry.title);
    const url = sanitizeUrl(entry.link);
    if (!title || !url) {
      warnings.push(`Skipped item with missing title/link (link: ${url || "none"}).`);
      continue;
    }

    const author = sanitizeText(entry.creator);
    items.push({
      title,
      url,
      category: source.category,
      summary: sanitizeText(entry.contentSnippet ?? entry.content),
      author: author || undefined,
      publishedAt: entry.isoDate,
      tags: source.tags,
    });
  }

  return { sourceId: source.id, items, warnings };
}

/**
 * RSS connector. A failing fetch yields warnings, never a throw, so one bad
 * source can't abort a multi-source run (§12.7).
 */
export const rssConnector: Connector = async (source) => {
  const unsafeReason = unsafeSourceUrlReason(source.url);
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
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml" },
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
