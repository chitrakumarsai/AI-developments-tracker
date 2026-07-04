import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { FeedbackValue } from "../supabase/types";

/** A thumbs vote to persist; `null` clears the user's vote on the item. */
export type VoteInput = {
  itemId: string;
  value: FeedbackValue | null;
};

/**
 * Persist a thumbs vote. The `feedback` table is an append-only history log, and
 * `items.feedback_value` holds the current vote (denormalized so the feed can
 * filter/rank on a plain column). A null `value` clears the current vote without
 * writing history — a toggle-off, not an event worth logging.
 *
 * The client is injected (defaults to the server-only service-role client) so
 * the write path is unit-testable without a live database. Throws on any DB
 * error so callers surface a real failure instead of a silent no-op.
 */
export async function recordVote(
  { itemId, value }: VoteInput,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  if (value !== null) {
    const { error } = await client
      .from("feedback")
      .insert({ item_id: itemId, value });
    if (error) {
      throw new Error(`Failed to record feedback: ${error.message}`);
    }
  }

  const { error } = await client
    .from("items")
    .update({ feedback_value: value })
    .eq("id", itemId);
  if (error) {
    throw new Error(`Failed to update item vote: ${error.message}`);
  }
}

/**
 * Mark an item as read (the user opened it at the source). Idempotent — setting
 * an already-true flag is harmless. Throws on DB error.
 */
export async function markRead(
  itemId: string,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client
    .from("items")
    .update({ read_state: true })
    .eq("id", itemId);
  if (error) {
    throw new Error(`Failed to mark item read: ${error.message}`);
  }
}
