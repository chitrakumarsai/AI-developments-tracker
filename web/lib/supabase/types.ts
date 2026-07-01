/**
 * Database row types (Sonar, Phase 1).
 *
 * Hand-written to mirror `supabase/migrations/20260622000001_init.sql`. Swap for
 * `supabase gen types typescript --local` output once the CLI is wired into the
 * toolchain; the shapes below are the contract until then.
 */

export type IngestionType = "rss" | "api" | "scrape" | "manual";
export type SourceStatus = "active" | "paused" | "archived";

export type ItemRow = {
  id: string;
  source_id: string;
  title: string;
  author: string | null;
  summary: string | null;
  url: string;
  category: string;
  tags: string[];
  relevance_score: number;
  read_state: boolean;
  published_at: string | null;
  fetched_at: string;
};

export type SourceRow = {
  id: string;
  name: string;
  category: string;
  url: string;
  ingestion_type: IngestionType;
  status: SourceStatus;
  priority: number;
  tags: string[];
  notes: string | null;
  added_on: string;
  last_fetched: string | null;
};
