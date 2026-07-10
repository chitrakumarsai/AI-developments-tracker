import type { Connector, IngestionResult, NormalizedItem, SourceRef } from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import {
  FETCH_TIMEOUT_MS,
  fetchFollowingSafeRedirects,
  readTextCapped,
  unsafeUrlReason,
  type FetchLike,
} from "../net";

/**
 * Sitemap connector (`ingestion_type = 'scrape'`).
 *
 * For publishers whose article list has no RSS feed and is painted client-side
 * — Adobe Experience Manager sites like Deloitte UK, for instance, whose
 * listing page contains zero article links and whose filter query params are
 * applied entirely in the browser. Scraping such a listing yields nothing.
 *
 * Their `sitemap.xml`, however, is public, robots-sanctioned, and complete. So
 * we read the sitemap for URLs and fetch each article once for its `og:` and
 * JSON-LD metadata. Still link-first (CLAUDE.md §7): we keep title, summary,
 * date and URL — never the article body.
 *
 * Catalog-driven (§6): a new sitemap source is a `sources` row, no new code.
 * The row's `url` carries both inputs as
 *   `https://host/sitemap.xml#include=/path/prefix/`
 * The fragment is never transmitted, so the fetch URL is unaffected.
 */

/** Articles fetched per run. Bounded and polite; re-runs dedupe on `url`. */
const MAX_ARTICLES = 25;

/** Delay between article fetches, so a run doesn't look like an attack. */
const FETCH_DELAY_MS = 200;

/**
 * Stop parsing a sitemap after this many `<url>` blocks. A hostile source could
 * serve millions; we only ever keep MAX_ARTICLES, so there is nothing to gain
 * from scanning (and sorting) the rest.
 */
const MAX_SITEMAP_ENTRIES = 20_000;

/**
 * Wall-clock ceiling for one source. Vercel functions default to 300s and the
 * cron route ingests every source in one invocation, so a single slow or
 * hostile host must not consume the whole budget: 1 + 25 fetches at the 15s
 * timeout would be ~380s on its own.
 */
const SOURCE_DEADLINE_MS = 60_000;

/** A year before this is not a plausible publication year for an AI blog. */
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
};

export type ArticleMeta = {
  title: string;
  summary: string;
  /** ISO 8601, or null when the page states no publication date. */
  publishedAt: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Split a source URL into the sitemap to fetch and the path prefix that marks
 * an article. `#include=` is a fragment, so it never reaches the server.
 * A source with no fragment accepts every URL in the sitemap.
 */
export function parseSitemapSource(sourceUrl: string): {
  sitemapUrl: string;
  includePrefix: string | null;
} {
  const [base, fragment = ""] = sourceUrl.split("#");
  const match = /(?:^|&)include=([^&]*)/.exec(fragment);
  const raw = match?.[1] ?? "";
  let includePrefix: string | null = null;
  if (raw) {
    try {
      includePrefix = decodeURIComponent(raw);
    } catch {
      includePrefix = raw; // a stray % — treat it literally rather than throw
    }
  }
  return { sitemapUrl: base, includePrefix };
}

/**
 * Text of the first `<tag>` inside a chunk, entity-decoded. Null when absent.
 *
 * Decoding goes through `sanitizeText`, never a local decoder: it rejects
 * out-of-range numeric character references (`&#99999999;`) that would make
 * `String.fromCodePoint` throw a RangeError and abort the whole run.
 */
function tagText(chunk: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(chunk);
  if (!match) return null;
  const text = sanitizeText(match[1]);
  return text || null;
}

/**
 * Read `<url>` entries from a sitemap. Deliberately regex-based rather than a
 * full XML parse: sitemaps are flat and huge (7.5k urls here), and a malformed
 * one must yield an empty list rather than throw (§12.7).
 */
export function parseSitemapEntries(xml: string, max = MAX_SITEMAP_ENTRIES): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    if (entries.length >= max) break;
    const loc = tagText(match[1], "loc");
    if (!loc) continue;
    entries.push({ loc, lastmod: tagText(match[1], "lastmod") });
  }
  return entries;
}

/** Epoch millis for sorting; entries without a lastmod sort last. */
function lastmodRank(entry: SitemapEntry): number {
  if (!entry.lastmod) return -Infinity;
  const t = Date.parse(entry.lastmod);
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * The articles worth fetching: same-origin as the sitemap, under the include
 * prefix, newest first, capped to `max`.
 *
 * The same-origin check matters — a sitemap is untrusted input. Without it a
 * hostile or compromised sitemap could point our fetcher at any host it liked
 * (SSRF, §12.7). `unsafeUrlReason` alone wouldn't catch that: `evil.example.net`
 * is a perfectly public host.
 */
export function selectArticles(
  entries: readonly SitemapEntry[],
  includePrefix: string | null,
  sitemapUrl: string,
  max: number,
): SitemapEntry[] {
  let origin: string;
  try {
    origin = new URL(sitemapUrl).origin;
  } catch {
    return [];
  }

  const matching = entries.filter((entry) => {
    let parsed: URL;
    try {
      parsed = new URL(entry.loc);
    } catch {
      return false;
    }
    if (parsed.origin !== origin) return false;
    if (includePrefix && !parsed.pathname.startsWith(includePrefix)) return false;
    return true;
  });

  return [...matching].sort((a, b) => lastmodRank(b) - lastmodRank(a)).slice(0, max);
}

/** Content of `<meta property|name="key" content="…">`, in either attribute order. */
function metaContent(html: string, key: string): string {
  const attr = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = new RegExp(
    `<meta[^>]+(?:property|name)=["']${attr}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const reverse = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${attr}["']`,
    "i",
  );
  const match = forward.exec(html) ?? reverse.exec(html);
  return match ? sanitizeText(match[1]) : "";
}

/**
 * The ISO `datePublished` from JSON-LD.
 *
 * Real pages ship more than one: Deloitte emits a human-readable
 * `"datePublished": "22 Aug 2023"` in a BreadcrumbList *before* the Article
 * block's `"datePublished":"2023-08-22T00:00:00.0Z"`. Taking the first match
 * would give an unparseable date, so scan every occurrence and keep the first
 * that actually parses as a date.
 */
function isoDatePublished(html: string): string | null {
  for (const match of html.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gi)) {
    const raw = match[1];
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) continue; // skip "22 Aug 2023"
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

/**
 * Extract link-first metadata from an article page. Never returns body text —
 * only `og:` attributes and the JSON-LD date.
 */
export function parseArticleMeta(html: string): ArticleMeta {
  return {
    title: metaContent(html, "og:title"),
    summary: metaContent(html, "og:description"),
    publishedAt: isoDatePublished(html),
  };
}

/**
 * Strip a trailing site-brand segment, e.g.
 * "Riding the generative AI wave | Deloitte UK" → "Riding the generative AI wave".
 *
 * Only strips when the trailing segment actually names the site (it contains the
 * host's registrable label), so a legitimate headline pipe — "GPT-4 | A review"
 * — keeps both halves. `og:site_name` is not usable for this: Deloitte's is
 * "Deloitte United Kingdom" while the suffix reads "Deloitte UK".
 */
export function cleanTitle(title: string, host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  const brand = labels[0] ?? "";
  if (!brand) return title.trim();

  const match = /^(.*?)\s+[|–—-]\s+([^|–—]+)$/.exec(title.trim());
  if (!match) return title.trim();
  const [, head, tail] = match;
  return tail.toLowerCase().includes(brand) ? head.trim() : title.trim();
}

/** A four-digit year segment in the URL path, e.g. `/blogs/2023/slug.html`. */
export function yearFromPath(pathname: string): number | null {
  for (const segment of pathname.split("/")) {
    if (!/^\d{4}$/.test(segment)) continue;
    const year = Number(segment);
    if (year >= MIN_YEAR && year <= MAX_YEAR) return year;
  }
  return null;
}

/**
 * Decide an item's publication date.
 *
 * `<lastmod>` is a *modification* date and is the last resort on purpose: on
 * Deloitte, posts under a `/2023/` path report a 2026 lastmod after a re-touch.
 * Trusting it would let years-old articles masquerade as new and dominate the
 * recency-weighted feed.
 */
export function resolvePublishedAt(
  articleIso: string | null,
  loc: string,
  lastmod: string | null,
): string | undefined {
  if (articleIso) return articleIso;

  try {
    const year = yearFromPath(new URL(loc).pathname);
    if (year) return new Date(Date.UTC(year, 0, 1)).toISOString();
  } catch {
    // fall through to lastmod
  }

  if (lastmod) {
    const t = Date.parse(lastmod);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return undefined;
}

/**
 * Fetch a URL as text through the shared SSRF guard.
 *
 * Never bare `fetch`: default fetch follows 3xx transparently, so an on-origin
 * article URL could 302 to 127.0.0.1 or the cloud-metadata endpoint
 * (169.254.169.254) and bypass the pre-fetch check. Every hop is re-validated,
 * and the body is size-capped so a hostile host can't OOM the worker.
 *
 * Throws on any failure; callers turn that into a warning.
 */
async function fetchText(
  url: string,
  accept: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const outcome = await fetchFollowingSafeRedirects(url, fetchImpl, controller.signal, {
      accept,
    });
    if ("reason" in outcome) throw new Error(outcome.reason);
    if (!outcome.res.ok) throw new Error(`HTTP ${outcome.res.status}`);
    return await readTextCapped(outcome.res);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sitemap connector. Warns rather than throws, so one bad source can never
 * abort a multi-source run (§12.7).
 */
export const sitemapConnector: Connector = async (source: SourceRef) =>
  ingestSitemap(source, fetch as unknown as FetchLike, Date.now() + SOURCE_DEADLINE_MS);

/** The connector body, with `fetch` and the deadline injected so it is testable. */
export async function ingestSitemap(
  source: SourceRef,
  fetchImpl: FetchLike,
  deadlineAt: number,
): Promise<IngestionResult> {
  const { sitemapUrl, includePrefix } = parseSitemapSource(source.url);

  const unsafeReason = unsafeUrlReason(sitemapUrl);
  if (unsafeReason) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Refusing to fetch ${source.name}: ${unsafeReason}.`],
    };
  }

  const warnings: string[] = [];
  let xml: string;
  try {
    xml = await fetchText(sitemapUrl, "application/xml, text/xml", fetchImpl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Fetch failed for ${source.name}: ${message}.`],
    };
  }

  const articles = selectArticles(parseSitemapEntries(xml), includePrefix, sitemapUrl, MAX_ARTICLES);
  if (articles.length === 0) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [
        `No articles in ${source.name}: the sitemap has no same-origin URL under "${includePrefix ?? "/"}".`,
      ],
    };
  }

  const host = new URL(sitemapUrl).hostname;
  const items: NormalizedItem[] = [];

  for (const [index, entry] of articles.entries()) {
    // A slow or hostile host must not eat the cron invocation's whole budget.
    if (Date.now() >= deadlineAt) {
      warnings.push(
        `Stopped after ${items.length} of ${articles.length} articles: ${source.name} exceeded its time budget.`,
      );
      break;
    }
    // Politeness: space out requests. Skipped before the first fetch.
    if (index > 0) await sleep(FETCH_DELAY_MS);

    let html: string;
    try {
      html = await fetchText(entry.loc, "text/html", fetchImpl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown fetch error";
      warnings.push(`Skipped ${entry.loc}: ${message}.`);
      continue;
    }

    const meta = parseArticleMeta(html);
    const url = sanitizeUrl(entry.loc);
    const title = sanitizeText(cleanTitle(meta.title, host));
    if (!title || !url) {
      warnings.push(`Skipped item with missing title/link (link: ${url || "none"}).`);
      continue;
    }

    items.push({
      title,
      url,
      category: source.category,
      summary: sanitizeText(meta.summary) || undefined,
      publishedAt: resolvePublishedAt(meta.publishedAt, entry.loc, entry.lastmod),
      tags: source.tags,
    });
  }

  return { sourceId: source.id, items, warnings };
}
