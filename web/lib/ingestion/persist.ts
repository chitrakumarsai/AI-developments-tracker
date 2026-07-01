import type { SupabaseClient } from "@supabase/supabase-js";

import type { IngestionResult } from "./types";

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
  }));

  let added = 0;
  if (rows.length > 0) {
    const { data, error } = await client
      .from("items")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      return {
        added: 0,
        skipped: rows.length,
        warnings: [...warnings, `Persist error: ${error.message}`],
      };
    }
    added = data?.length ?? 0;
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
