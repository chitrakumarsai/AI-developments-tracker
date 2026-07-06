import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedFilters } from "./href";

/** A stored filter preset, owned by one user (2.2). */
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
 * Persist a named filter preset for the signed-in user (2.2, per-user). `user_id`
 * is set explicitly so RLS's WITH CHECK passes; the auth-aware client + verified
 * `userId` are injected by the caller. Throws on DB error.
 */
export async function createView(
  { name, filters }: CreateViewInput,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from("saved_views")
    .insert({ user_id: userId, name, filters });
  if (error) {
    throw new Error(`Failed to save view: ${error.message}`);
  }
}

/**
 * List the user's saved views, oldest first (stable order in the UI). RLS already
 * scopes to the owner, and the explicit `user_id` filter keeps the intent clear
 * (and correct even under the service-role client). Throws on DB error.
 */
export async function listViews(
  userId: string,
  client: SupabaseClient,
): Promise<SavedView[]> {
  const { data, error } = await client
    .from("saved_views")
    .select("id, name, filters")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load views: ${error.message}`);
  }
  return (data ?? []) as unknown as SavedView[];
}

/**
 * Delete one of the user's saved views by id. Scoped by `user_id` in addition to
 * RLS so a tampered id can't touch another user's row even under service-role.
 * Throws on DB error.
 */
export async function deleteView(
  id: string,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to delete view: ${error.message}`);
  }
}
