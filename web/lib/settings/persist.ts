import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

/** The one settings row (Phase-1 singleton, enforced by `id = 1`). */
const SETTINGS_ID = 1;

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
 * Load the app settings. Returns typed defaults when no row exists yet, so the
 * feed always has a value to work with. Injectable client for tests; throws on
 * a real DB error (callers on the feed path catch and fall back to defaults).
 */
export async function getSettings(
  client: SupabaseClient = getServerClient(),
): Promise<AppSettings> {
  const { data, error } = await client
    .from("app_settings")
    .select("top_per_source_day, include_keywords, exclude_keywords, min_metric")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load settings: ${error.message}`);
  }
  return data ? fromRow(data as unknown as SettingsRow) : DEFAULT_SETTINGS;
}

/**
 * Persist the settings singleton (upsert on the fixed id). Input is assumed
 * already validated/normalized at the route boundary. Throws on DB error.
 */
export async function saveSettings(
  input: AppSettings,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client.from("app_settings").upsert({
    id: SETTINGS_ID,
    top_per_source_day: input.topPerSourceDay,
    include_keywords: input.includeKeywords,
    exclude_keywords: input.excludeKeywords,
    min_metric: input.minMetric,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }
}
