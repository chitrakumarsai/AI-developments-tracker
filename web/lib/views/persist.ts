import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { SavedFilters } from "./href";

/** A stored filter preset. Phase 1 is single-user, so views aren't user-scoped yet. */
export type SavedView = {
  id: string;
  name: string;
  filters: SavedFilters;
};

export type CreateViewInput = {
  name: string;
  filters: SavedFilters;
};

/**
 * Persist a named filter preset. The client is injected (defaults to the
 * server-only service-role client) so this is unit-testable without a database.
 * Throws on DB error.
 */
export async function createView(
  { name, filters }: CreateViewInput,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client.from("saved_views").insert({ name, filters });
  if (error) {
    throw new Error(`Failed to save view: ${error.message}`);
  }
}

/** List saved views, oldest first (stable order in the UI). Throws on DB error. */
export async function listViews(
  client: SupabaseClient = getServerClient(),
): Promise<SavedView[]> {
  const { data, error } = await client
    .from("saved_views")
    .select("id, name, filters")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load views: ${error.message}`);
  }
  return (data ?? []) as unknown as SavedView[];
}

/** Delete a saved view by id. Throws on DB error. */
export async function deleteView(
  id: string,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client.from("saved_views").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete view: ${error.message}`);
  }
}
