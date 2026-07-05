import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeedbackValue } from "../supabase/types";

/** The current user's vote + read-state for a set of items. */
export type UserItemState = {
  /** item_id → current thumbs vote. Missing key = no vote. */
  votes: Map<string, FeedbackValue>;
  /** item_ids the user has opened. */
  reads: Set<string>;
};

const EMPTY_STATE: UserItemState = { votes: new Map(), reads: new Set() };

/**
 * Load the signed-in user's votes and read-state for the given items. Scoped to
 * `itemIds` so it stays bounded to the current feed pool. The client MUST be the
 * auth-aware (anon-key, session-bound) client so RLS returns only this user's
 * rows — passing the service-role client here would leak every user's votes.
 *
 * Returns empty state for anonymous callers (no `userId`) or an empty pool, so
 * the feed renders as "unvoted / unread" without a query.
 */
export async function loadUserItemState(
  client: SupabaseClient,
  userId: string | null | undefined,
  itemIds: string[],
): Promise<UserItemState> {
  if (!userId || itemIds.length === 0) return EMPTY_STATE;

  // The auth client + RLS already scope these to auth.uid(); the explicit
  // user_id filter is defense in depth so an accidental service-role client can
  // never widen this to every user's votes/reads.
  const [feedbackRes, readsRes] = await Promise.all([
    client
      .from("feedback")
      .select("item_id, value")
      .eq("user_id", userId)
      .in("item_id", itemIds),
    client
      .from("item_reads")
      .select("item_id")
      .eq("user_id", userId)
      .in("item_id", itemIds),
  ]);

  if (feedbackRes.error) {
    throw new Error(`Failed to load feedback: ${feedbackRes.error.message}`);
  }
  if (readsRes.error) {
    throw new Error(`Failed to load read-state: ${readsRes.error.message}`);
  }

  const votes = new Map<string, FeedbackValue>();
  for (const row of (feedbackRes.data ?? []) as Array<{
    item_id: string;
    value: FeedbackValue;
  }>) {
    votes.set(row.item_id, row.value);
  }

  const reads = new Set<string>();
  for (const row of (readsRes.data ?? []) as Array<{ item_id: string }>) {
    reads.add(row.item_id);
  }

  return { votes, reads };
}

/**
 * Annotate items with the current user's vote + read-state. The Phase-1 global
 * `feedback_value`/`read_state` columns are ignored — the per-user tables are the
 * source of truth now, so one user's votes never bleed into another's feed.
 */
export function annotateWithUserState<
  T extends { id: string; feedback_value: FeedbackValue | null; read_state: boolean },
>(items: T[], state: UserItemState): T[] {
  return items.map((item) => ({
    ...item,
    feedback_value: state.votes.get(item.id) ?? null,
    read_state: state.reads.has(item.id),
  }));
}
