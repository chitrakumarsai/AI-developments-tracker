import type { Connector, IngestionResult, NormalizedItem, SourceRef } from "../types";
import { sanitizeText, sanitizeUrl } from "../sanitize";
import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../net";

/**
 * Hugging Face connector — daily curated papers + trending models, link-first
 * (CLAUDE.md §7). One provider, two endpoints dispatched by URL path:
 *   /api/daily_papers  → Research Papers   (link → huggingface.co/papers/{id})
 *   /api/models        → LLM & Other Models (link → huggingface.co/{id})
 * Follows the house connector pattern (see github.ts): pure mappers split from
 * I/O, sanitizes untrusted fields, warns-not-throws. Registered for host
 * huggingface.co via the api router.
 */

const MAX_ITEMS = 50;
const MAX_AUTHORS = 20;
const HF_ORIGIN = "https://huggingface.co";

type HfPaperEntry = {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    authors?: Array<{ name?: string }>;
    publishedAt?: string;
  };
};

type HfModel = {
  id?: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string;
  createdAt?: string;
};

/** Pure mapping for /api/daily_papers — network-free, fixture-testable. */
export function parseHfPapers(json: HfPaperEntry[], source: SourceRef): IngestionResult {
  const warnings: string[] = [];
  const items: NormalizedItem[] = [];

  for (const entry of (json ?? []).slice(0, MAX_ITEMS)) {
    const paper = entry.paper;
    const id = paper?.id?.trim();
    const url = id ? sanitizeUrl(`${HF_ORIGIN}/papers/${id}`) : "";
    const title = sanitizeText(paper?.title);
    if (!id || !url || !title) {
      warnings.push(`Skipped paper with missing id/title (title: ${title || "none"}).`);
      continue;
    }
    const authors = (paper?.authors ?? [])
      .slice(0, MAX_AUTHORS)
      .map((a) => sanitizeText(a.name))
      .filter(Boolean)
      .join(", ");
    items.push({
      title,
      url,
      category: source.category,
      summary: sanitizeText(paper?.summary) || undefined,
      author: authors || undefined,
      publishedAt: paper?.publishedAt,
      tags: source.tags,
    });
  }

  return { sourceId: source.id, items, warnings };
}

/** Pure mapping for /api/models — network-free, fixture-testable. */
export function parseHfModels(json: HfModel[], source: SourceRef): IngestionResult {
  const warnings: string[] = [];
  const items: NormalizedItem[] = [];

  for (const model of (json ?? []).slice(0, MAX_ITEMS)) {
    const id = model.id?.trim();
    const title = sanitizeText(id);
    const url = id ? sanitizeUrl(`${HF_ORIGIN}/${id}`) : "";
    if (!id || !title || !url) {
      warnings.push(`Skipped model with missing id.`);
      continue;
    }
    const pipeline = sanitizeText(model.pipeline_tag);
    const summaryParts = [
      pipeline || null,
      typeof model.likes === "number" ? `${model.likes} likes` : null,
      typeof model.downloads === "number" ? `${model.downloads} downloads` : null,
    ].filter(Boolean);
    items.push({
      title,
      url,
      category: source.category,
      summary: summaryParts.length ? summaryParts.join(" · ") : undefined,
      author: sanitizeText(id.split("/")[0]) || undefined,
      publishedAt: model.createdAt,
      tags: source.tags,
    });
  }

  return { sourceId: source.id, items, warnings };
}

type PathParser = (json: unknown, source: SourceRef) => IngestionResult;

/** Pick the mapper for a Hugging Face endpoint by URL path; null if unsupported. */
function parserForPath(pathname: string): PathParser | null {
  if (pathname === "/api/daily_papers") {
    return (json, source) => parseHfPapers(json as HfPaperEntry[], source);
  }
  if (pathname.startsWith("/api/models")) {
    return (json, source) => parseHfModels(json as HfModel[], source);
  }
  return null;
}

export const huggingfaceConnector: Connector = async (source) => {
  const unsafeReason = unsafeUrlReason(source.url);
  if (unsafeReason) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Refusing to fetch ${source.name}: ${unsafeReason}.`],
    };
  }

  const parse = parserForPath(new URL(source.url).pathname);
  if (!parse) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`Unsupported Hugging Face path for ${source.name}: ${source.url}.`],
    };
  }

  const warnings: string[] = [];
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "application/json",
  };
  const token = process.env.HUGGINGFACE_TOKEN;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else {
    warnings.push(`No HUGGINGFACE_TOKEN set for ${source.name}; using unauthenticated rate limits.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers });
    if (!response.ok) {
      warnings.push(`Fetch failed for ${source.name}: HTTP ${response.status}.`);
      return { sourceId: source.id, items: [], warnings };
    }
    const json = await response.json();
    const parsed = parse(json, source);
    return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    warnings.push(`Fetch error for ${source.name}: ${message}.`);
    return { sourceId: source.id, items: [], warnings };
  } finally {
    clearTimeout(timeout);
  }
};
