import type { Connector, IngestionResult, NormalizedItem, SourceRef } from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../net";

/**
 * GitHub connector — notable AI repositories via the Search API, link-first
 * (CLAUDE.md §7). Follows the house connector pattern (see rss.ts): returns
 * IngestionResult, sanitizes untrusted fields, warns-not-throws. Registered
 * for hosts api.github.com via the api router.
 */

const MAX_ITEMS = 50;
const PUSHED_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

type GithubRepo = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  pushed_at?: string;
  stargazers_count?: number;
  forks_count?: number;
  owner?: { login?: string };
};

type GithubSearchResponse = { items?: GithubRepo[] };

/** Pure mapping — network-free, fixture-testable. */
export function parseGithubSearch(
  json: GithubSearchResponse,
  source: SourceRef,
): IngestionResult {
  const warnings: string[] = [];
  const items: NormalizedItem[] = [];

  for (const repo of (json.items ?? []).slice(0, MAX_ITEMS)) {
    const title = sanitizeText(repo.full_name);
    const url = sanitizeUrl(repo.html_url);
    if (!title || !url) {
      warnings.push(`Skipped repo with missing name/url (name: ${title || "none"}).`);
      continue;
    }
    const author = sanitizeText(repo.owner?.login);
    const stars =
      typeof repo.stargazers_count === "number" && repo.stargazers_count >= 0
        ? repo.stargazers_count
        : undefined;
    const forks =
      typeof repo.forks_count === "number" && repo.forks_count >= 0
        ? repo.forks_count
        : undefined;
    items.push({
      title,
      url,
      category: source.category,
      summary: sanitizeText(repo.description),
      author: author || undefined,
      publishedAt: repo.pushed_at,
      tags: source.tags,
      metric: stars,
      forks,
    });
  }

  return { sourceId: source.id, items, warnings };
}

/**
 * Build the Search API request URL from the source's configured topic query,
 * injecting a rolling "pushed:>=" window and stars sort so "recently active"
 * stays fresh without a stale seed date.
 */
export function buildGithubSearchUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const since = new Date(Date.now() - PUSHED_WINDOW_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  const q = `${url.searchParams.get("q") ?? ""} pushed:>=${since}`.trim();
  url.searchParams.set("q", q);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(MAX_ITEMS));
  return url.toString();
}

export const githubConnector: Connector = async (source) => {
  // Guard the URL build too: a malformed source.url must warn, not throw, so one
  // bad source can't abort a multi-source run (§12.7).
  let requestUrl: string;
  try {
    requestUrl = buildGithubSearchUrl(source.url);
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
    accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else {
    warnings.push(`No GITHUB_TOKEN set for ${source.name}; using unauthenticated rate limits.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, { signal: controller.signal, headers });
    if (!response.ok) {
      warnings.push(`Fetch failed for ${source.name}: HTTP ${response.status}.`);
      return { sourceId: source.id, items: [], warnings };
    }
    const json = (await response.json()) as GithubSearchResponse;
    const parsed = parseGithubSearch(json, source);
    return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    warnings.push(`Fetch error for ${source.name}: ${message}.`);
    return { sourceId: source.id, items: [], warnings };
  } finally {
    clearTimeout(timeout);
  }
};
