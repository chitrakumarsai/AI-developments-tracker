import type { Connector } from "./types";
import type { IngestionType } from "../supabase/types";
import { rssConnector } from "./rss/rss";
import { apiConnector } from "./api/router";

/**
 * Connector registry — maps a source's `ingestion_type` to its connector, so
 * ingestion is catalog-driven (CLAUDE.md §6/§7): what runs is decided by the
 * `sources` table, not by code. `rss` → one generic connector for all feeds;
 * `api` → a host router that picks the provider (GitHub, HF, …) by URL host.
 *
 * `scrape` and `manual` connectors arrive later; until then `getConnector`
 * returns null and the caller records a warning.
 */
const REGISTRY: Partial<Record<IngestionType, Connector>> = {
  rss: rssConnector,
  api: apiConnector,
};

export function getConnector(ingestionType: IngestionType): Connector | null {
  return REGISTRY[ingestionType] ?? null;
}
