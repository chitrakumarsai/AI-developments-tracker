import type { SupabaseClient } from "@supabase/supabase-js";

import type { IngestionResult } from "./types";
import { embedItems } from "../embeddings/embedItems";
import type { Embed } from "../llm/openai";

export type PersistOutcome = {
  added: number;
  skipped: number;
  warnings: string[];
};

/**
 * Upsert normalized items (dedupe on `url`), then stamp the source's
 * `last_fetched`. Duplicates are ignored at the DB level via the unique `url`
 * constraint, so re-running a feed adds nothing new.
 *
 * The Supabase client is injected so this is unit-testable without a live DB.
 */
export async function persistItems(
  client: SupabaseClient,
  result: IngestionResult,
  embedFn?: Embed,
): Promise<PersistOutcome> {
  const warnings = [...result.warnings];

  const rows = result.items.map((item) => ({
    source_id: result.sourceId,
    title: item.title,
    url: item.url,
    category: item.category,
    author: item.author ?? null,
    summary: item.summary ?? null,
    tags: item.tags ?? [],
    published_at: item.publishedAt ?? null,
    metric: item.metric ?? null,
    forks: item.forks ?? null,
  }));

  let added = 0;
  if (rows.length > 0) {
    const { data, error } = await client
      .from("items")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id, title, summary");

    if (error) {
      return {
        added: 0,
        skipped: rows.length,
        warnings: [...warnings, `Persist error: ${error.message}`],
      };
    }
    const inserted = (data ?? []) as Array<{ id: string; title: string | null; summary: string | null }>;
    added = inserted.length;

    // Embed the newly-inserted items for semantic prompt-views (v4 Slice B),
    // best-effort: a failure only warns and never blocks ingest (the backfill
    // route catches stragglers). Skipped when no key is configured AND no
    // embedder is injected, so the no-network test env stays quiet.
    const shouldEmbed = Boolean(embedFn) || Boolean(process.env.OPENAI_API_KEY);
    if (added > 0 && shouldEmbed) {
      const { warnings: embedWarnings } = await embedItems(client, inserted, embedFn);
      warnings.push(...embedWarnings);
    }

    // Refresh the popularity signals on existing rows too: `ignoreDuplicates`
    // skips them on insert, but stars/likes/forks change over time and should
    // stay current (this also backfills rows ingested before these columns
    // existed). Keyed on the unique `url`; runs only for metric-bearing items.
    // `forks` is refreshed alongside `metric` (null for non-GitHub sources).
    const metricRows = result.items.filter((item) => typeof item.metric === "number");
    if (metricRows.length > 0) {
      const updates = await Promise.all(
        metricRows.map((item) =>
          client
            .from("items")
            .update({ metric: item.metric, forks: item.forks ?? null })
            .eq("url", item.url),
        ),
      );
      const failed = updates.filter((u) => u.error).length;
      if (failed > 0) {
        warnings.push(`Could not refresh metric on ${failed} item(s).`);
      }
    }
  }

  const { error: stampError } = await client
    .from("sources")
    .update({ last_fetched: new Date().toISOString() })
    .eq("id", result.sourceId);
  if (stampError) {
    warnings.push(`Could not update last_fetched: ${stampError.message}`);
  }

  return { added, skipped: rows.length - added, warnings };
}
