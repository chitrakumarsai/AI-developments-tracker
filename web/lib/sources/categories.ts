/**
 * Shared source taxonomy (CLAUDE.md §3) — the content categories a source can
 * feed, plus the ingestion types. Kept in one place so the add form and the edit
 * controls offer the same choices (no drift). Plain module: importable by both
 * client and server code.
 */
export const SOURCE_CATEGORIES = [
  "Research Papers",
  "Companies & Labs",
  "GitHub Repositories",
  "LLM & Other Models",
  "Products & Tools",
  "Newsletters & Blogs",
  "Video & Podcasts",
  "Social / Discussion",
  "Conferences",
  "Datasets & Benchmarks",
  "Funding & Industry",
] as const;

export const INGESTION_TYPES = ["rss", "api", "scrape", "manual"] as const;
