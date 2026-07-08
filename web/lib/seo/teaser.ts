import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getFeedItems } from "../feed/queries";
import { getServerClient } from "../supabase/server";
import type { ItemRow } from "../supabase/types";

/**
 * How many headlines the public landing previews. Deliberately small (2.4): a
 * taste of the signal for anonymous visitors + indexable content, with the
 * full, top-rated, personalized feed unlocked only by signing in.
 */
export const TEASER_LIMIT = 5;

/**
 * The latest public headlines for the anonymous landing teaser.
 *
 * Reads through the SERVICE-ROLE client (default) because 2.4 removed anon read
 * access to items/sources (see `20260706000001_gate_feed_rls.sql`) — the anon
 * key can no longer read the feed, so the teaser is served server-side instead.
 * `userId` is null, so no per-user state is loaded and the Phase-1 global
 * feedback columns are reset to unvoted: nothing personal leaks onto the public
 * surface. The result is capped at {@link TEASER_LIMIT} regardless of what the
 * query returns. The client is injectable for tests.
 */
export async function getTeaserItems(
  client: SupabaseClient = getServerClient(),
): Promise<ItemRow[]> {
  const items = await getFeedItems(
    { sort: "recent", window: "all", limit: TEASER_LIMIT, userId: null },
    client,
  );
  return items.slice(0, TEASER_LIMIT);
}
