import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeedbackValue } from "../supabase/types";

/** A thumbs vote to persist; `null` clears the user's vote on the item. */
export type VoteInput = {
  itemId: string;
  value: FeedbackValue | null;
};

/**
 * Persist a user's thumbs vote (2.2, per-user). One row per (user, item) in
 * `feedback` — a new vote upserts on that pair, and a null `value` deletes the
 * row (toggle-off). RLS scopes both to `auth.uid()`, so a user can only ever
 * write their own vote; `user_id` is set explicitly to satisfy the WITH CHECK.
 *
 * The auth-aware client and the verified `userId` are injected by the caller
 * (the API route resolves both from the session). Throws on any DB error so the
 * caller surfaces a real failure instead of a silent no-op.
 */
export async function recordVote(
  { itemId, value }: VoteInput,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  if (value === null) {
    const { error } = await client
      .from("feedback")
      .delete()
      .eq("user_id", userId)
      .eq("item_id", itemId);
    if (error) {
      throw new Error(`Failed to clear feedback: ${error.message}`);
    }
    return;
  }

  const { error } = await client
    .from("feedback")
    .upsert(
      { user_id: userId, item_id: itemId, value },
      { onConflict: "user_id,item_id" },
    );
  if (error) {
    throw new Error(`Failed to record feedback: ${error.message}`);
  }
}

/**
 * Mark an item as read for this user (2.2, per-user). Inserts into `item_reads`;
 * idempotent via ON CONFLICT so re-opening is harmless. RLS scopes to
 * `auth.uid()`. Throws on DB error.
 */
export async function markRead(
  itemId: string,
  userId: string,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from("item_reads")
    .upsert(
      { user_id: userId, item_id: itemId },
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(`Failed to mark item read: ${error.message}`);
  }
}
