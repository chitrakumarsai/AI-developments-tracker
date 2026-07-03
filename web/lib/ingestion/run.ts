import type { SupabaseClient } from "@supabase/supabase-js";

import { getConnector } from "./registry";
import { persistItems } from "./persist";
import { isDue } from "./interval";
import type { SourceRow } from "../supabase/types";

/** Outcome for a single source within a run. */
export type SourceRunResult = {
  source: string;
  added: number;
  skipped: number;
  warnings: string[];
  /** Set only when the connector threw; the run continues past it (§12.7). */
  error?: string;
};

/** Summary of one ingestion run across all processed sources. */
export type RunSummary = {
  added: number;
  sources: number;
  perSource: SourceRunResult[];
};

export type RunIngestionOptions = {
  /** Restrict to a single source id; omit or "all" to run every active source. */
  sourceId?: string;
  /** Only run sources due per their `refresh_interval` (scheduled refresh). */
  dueOnly?: boolean;
  /** Injected clock for the due check — tests pass a fixed `now`. */
  now?: Date;
  /** Injected for testability; defaults to the real registry/persist. */
  resolveConnector?: typeof getConnector;
  persist?: typeof persistItems;
};

/**
 * Run ingestion for the active sources and return a per-source summary.
 *
 * Shared by the manual trigger (`POST /api/ingest/run`) and the scheduled cron
 * route (`GET /api/cron/refresh`, `dueOnly: true`). Catalog-driven (§6/§7): what
 * runs is decided by the `sources` table, dispatched by `ingestion_type`.
 *
 * Resilience (§12.7): each source runs inside its own try/catch, so one failing
 * connector is recorded and the loop continues rather than aborting the run.
 * `persistItems` stamps `last_fetched`, which the due check reads next time.
 */
export async function runIngestion(
  client: SupabaseClient,
  options: RunIngestionOptions = {},
): Promise<RunSummary> {
  const {
    sourceId,
    dueOnly = false,
    now = new Date(),
    resolveConnector = getConnector,
    persist = persistItems,
  } = options;

  let query = client.from("sources").select("*").eq("status", "active");
  if (sourceId && sourceId !== "all") {
    query = query.eq("id", sourceId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const sources = (data ?? []) as SourceRow[];
  const perSource: SourceRunResult[] = [];

  for (const source of sources) {
    if (dueOnly && !isDue(source.last_fetched, source.refresh_interval, now)) {
      continue;
    }

    const connector = resolveConnector(source.ingestion_type);
    if (!connector) {
      perSource.push({
        source: source.name,
        added: 0,
        skipped: 0,
        warnings: [`No connector for ingestion_type '${source.ingestion_type}' yet.`],
      });
      continue;
    }

    try {
      const ingestion = await connector({
        id: source.id,
        name: source.name,
        category: source.category,
        url: source.url,
        tags: source.tags,
      });
      const outcome = await persist(client, ingestion);
      perSource.push({ source: source.name, ...outcome });
    } catch (err) {
      perSource.push({
        source: source.name,
        added: 0,
        skipped: 0,
        warnings: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const added = perSource.reduce((sum, result) => sum + result.added, 0);
  return { added, sources: perSource.length, perSource };
}
