import type { Connector, IngestionResult, NormalizedItem, SourceRef } from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../net";

/**
 * Reddit connector — top-of-month posts from a subreddit via the public
 * `top.json` endpoint, link-first (CLAUDE.md §7). Keyless (no OAuth) — Reddit
 * serves the public JSON but rate-limits by User-Agent, so a descriptive UA is
 * required (see net.ts). Follows the house connector pattern (see github.ts /
 * hackernews.ts): pure mapper split from I/O, sanitizes untrusted fields,
 * warns-not-throws. Registered for hosts reddit.com / www.reddit.com via the
 * api router.
 *
 * Link-first rule: prefer the post's external `url` (what a link post points
 * at); for self/text posts with no external target, fall back to the permalink
 * discussion page. Reddit already sets `url` to the permalink for self posts, so
 * the fallback mainly guards malformed payloads.
 *
 * Noise gate (§1.4 Slice C): top-of-month ordering alone is too weak once we
 * track broader/noisier subreddits (r/singularity, r/agi) — a quiet week still
 * surfaces weak posts. So the connector enforces two floors: drop any post below
 * `MIN_SCORE` upvotes, then keep only the `TOP_K` highest-scoring per subreddit.
 * Only genuinely popular items reach the DB. Dropped-by-floor posts are an
 * intentional selection (not a data problem), so they are removed without a
 * warning — mirroring the HN connector. `score` is stored as the item `metric`
 * so the ranker can normalize Reddit popularity per source.
 *
 * These are named constants (not magic numbers); the future Settings slice
 * (v3 item 3) can lift them into per-source config columns.
 */

const MAX_ITEMS = 50;
const MIN_SCORE = 50;
const TOP_K = 5;
const REDDIT_ORIGIN = "https://www.reddit.com";

type RedditPost = {
  title?: string;
  url?: string | null;
  permalink?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
};

type RedditChild = { kind?: string; data?: RedditPost };
type RedditListing = { data?: { children?: RedditChild[] } };

/** Convert a Reddit epoch-seconds timestamp to an ISO string; undefined if absent/invalid. */
function toIsoFromEpochSeconds(seconds: unknown): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Resolve a Reddit `permalink` (normally a root-relative path like `/r/x/...`)
 * against the Reddit origin. Uses relative-URL resolution rather than string
 * concatenation so a malformed/absolute permalink can't produce a nonsense
 * string; returns "" on failure so `sanitizeUrl` simply skips it.
 */
function permalinkUrl(permalink: string): string {
  try {
    return new URL(permalink, REDDIT_ORIGIN).href;
  } catch {
    return "";
  }
}

/** Pure mapping — network-free, fixture-testable. */
export function parseReddit(json: RedditListing, source: SourceRef): IngestionResult {
  const warnings: string[] = [];
  const items: NormalizedItem[] = [];

  for (const child of (json.data?.children ?? []).slice(0, MAX_ITEMS)) {
    const post = child.data;
    if (!post) continue;

    const title = sanitizeText(post.title);
    if (!title) {
      const who = sanitizeText(post.author) || "none";
      warnings.push(`Skipped Reddit post with missing title (author: ${who}).`);
      continue;
    }
    const external = sanitizeUrl(post.url);
    const fallback = post.permalink ? sanitizeUrl(permalinkUrl(post.permalink)) : "";
    const url = external || fallback;
    if (!url) {
      warnings.push(`Skipped Reddit post with no usable url (title: ${title}).`);
      continue;
    }
    const score =
      typeof post.score === "number" && Number.isFinite(post.score) && post.score >= 0
        ? post.score
        : undefined;
    // Score floor (see file header): missing/sub-threshold score → dropped as an
    // intentional selection, no warning.
    if (score === undefined || score < MIN_SCORE) continue;
    const summaryParts = [
      typeof post.score === "number" ? `${post.score} upvotes` : null,
      typeof post.num_comments === "number" ? `${post.num_comments} comments` : null,
    ].filter(Boolean);
    items.push({
      title,
      url,
      category: source.category,
      summary: summaryParts.length ? summaryParts.join(" · ") : undefined,
      author: sanitizeText(post.author) || undefined,
      publishedAt: toIsoFromEpochSeconds(post.created_utc),
      tags: source.tags,
      metric: score,
    });
  }

  // Top-K cap (see file header): Reddit returns score-sorted, but sort
  // defensively before slicing so the cap is correct regardless of input order.
  const topItems = [...items]
    .sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0))
    .slice(0, TOP_K);

  return { sourceId: source.id, items: topItems, warnings };
}

export const redditConnector: Connector = async (source) => {
  const unsafeReason = unsafeUrlReason(source.url);
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
    const response = await fetch(source.url, { signal: controller.signal, headers });
    if (!response.ok) {
      warnings.push(`Fetch failed for ${source.name}: HTTP ${response.status}.`);
      return { sourceId: source.id, items: [], warnings };
    }
    const json = (await response.json()) as RedditListing;
    const parsed = parseReddit(json, source);
    return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    warnings.push(`Fetch error for ${source.name}: ${message}.`);
    return { sourceId: source.id, items: [], warnings };
  } finally {
    clearTimeout(timeout);
  }
};
