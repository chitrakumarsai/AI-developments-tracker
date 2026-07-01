import type { Connector } from "./types";
import type { IngestionType } from "../supabase/types";
import { rssConnector } from "./rss/rss";

/**
 * Connector registry — maps a source's `ingestion_type` to its connector, so
 * ingestion is catalog-driven (CLAUDE.md §6/§7): what runs is decided by the
 * `sources` table, not by code. Adding an RSS source is just a new row.
 *
 * `api`, `scrape`, and `manual` connectors arrive in later 1.2 slices; until
 * then `getConnector` returns null and the caller records a warning.
 */
const REGISTRY: Partial<Record<IngestionType, Connector>> = {
  rss: rssConnector,
};

export function getConnector(ingestionType: IngestionType): Connector | null {
  return REGISTRY[ingestionType] ?? null;
}
