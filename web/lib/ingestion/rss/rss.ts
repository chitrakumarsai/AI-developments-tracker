import Parser from "rss-parser";

import type {
  Connector,
  IngestionResult,
  NormalizedItem,
  SourceRef,
} from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../net";

/**
 * Generic RSS/Atom connector — the link-first reference implementation
 * (CLAUDE.md §7). Handles any standard feed: arXiv category feeds, company/lab
 * blogs, newsletters, Reddit/YouTube RSS, etc. New RSS sources are added as
 * `sources` rows with `ingestion_type='rss'` — no new code (see registry.ts).
 */

/** Cap items stored per source per run (preference: latest 50). */
const MAX_ITEMS = 50;

type RssEntry = {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  // Feeds vary: dc:creator is a string, but Atom <author> parses to an object
  // like { name: ["Keyword Team"] }. Kept as unknown and flattened in readAuthor.
  creator?: unknown;
  author?: unknown;
  isoDate?: string;
};

const parser = new Parser<unknown, RssEntry>();

/**
 * Flatten an rss-parser author value to a plain string. Handles dc:creator
 * (string) and Atom <author> objects ({ name: string | string[] }); returns ""
 * for anything else so the connector never crashes on an odd feed shape.
 */
export function readAuthor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
    if (Array.isArray(name) && typeof name[0] === "string") return name[0];
  }
  return "";
}

/**
 * Escape bare `&` that are not part of a valid XML entity. Some real feeds
 * (e.g. Apple ML Research) ship unescaped ampersands, which make the strict XML
 * parser throw "Invalid character in entity name" and drop the whole feed.
 * Leaves valid entities (&amp; &lt; &#233; &#x2014; …) untouched.
 */
export function repairEntities(xml: string): string {
  return xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
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
  const feed = await parser.parseString(repairEntities(xml));
  const items: NormalizedItem[] = [];

  for (const entry of feed.items.slice(0, MAX_ITEMS)) {
    const title = sanitizeText(entry.title);
    const url = sanitizeUrl(entry.link);
    if (!title || !url) {
      warnings.push(`Skipped item with missing title/link (link: ${url || "none"}).`);
      continue;
    }

    const author = sanitizeText(readAuthor(entry.creator ?? entry.author));
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
  const unsafeReason = unsafeUrlReason(source.url);
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
