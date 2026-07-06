import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_SETTINGS, type AppSettings } from "./types";

type SettingsRow = {
  top_per_source_day: number | null;
  include_keywords: string[] | null;
  exclude_keywords: string[] | null;
  min_metric: number | null;
};

function fromRow(row: SettingsRow): AppSettings {
  return {
    topPerSourceDay: row.top_per_source_day ?? null,
    includeKeywords: row.include_keywords ?? [],
    excludeKeywords: row.exclude_keywords ?? [],
    minMetric: row.min_metric ?? null,
  };
}

/**
 * Load the signed-in user's settings (2.2, per-user: one row per `user_id`).
 * Returns typed defaults when the user has no row yet (or is anonymous), so the
 * feed always has a value to work with. The auth-aware client + verified `userId`
 * are injected by the caller; RLS scopes the read to the user's own row. Throws
 * on a real DB error (feed-path callers catch and fall back to defaults).
 */
export async function getSettings(
  userId: string | null | undefined,
  client: SupabaseClient,
): Promise<AppSettings> {
  if (!userId) return DEFAULT_SETTINGS;

  const { data, error } = await client
    .from("app_settings")
    .select("top_per_source_day, include_keywords, exclude_keywords, min_metric")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load settings: ${error.message}`);
  }
  return data ? fromRow(data as unknown as SettingsRow) : DEFAULT_SETTINGS;
}

/**
 * Persist the signed-in user's settings (upsert on `user_id`, one row per user).
 * Input is assumed already validated/normalized at the route boundary. `user_id`
 * is set explicitly so RLS's WITH CHECK passes. Throws on DB error.
 */
export async function saveSettings(
  input: AppSettings,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client.from("app_settings").upsert(
    {
      user_id: userId,
      top_per_source_day: input.topPerSourceDay,
      include_keywords: input.includeKeywords,
      exclude_keywords: input.excludeKeywords,
      min_metric: input.minMetric,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }
}
