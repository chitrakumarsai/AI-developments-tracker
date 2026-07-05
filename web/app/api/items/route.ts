import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getFeedItems,
  DEFAULT_FEED_LIMIT,
  DEFAULT_WINDOW,
  MAX_FEED_LIMIT,
  type FeedSort,
} from "@/lib/feed/queries";
import { categoryForSlug } from "@/lib/feed/categories";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
  section: z.string().optional(),
  sort: z.enum(["relevant", "recent", "stars"]).default("relevant"),
  window: z.enum(["today", "week", "month", "all"]).default(DEFAULT_WINDOW),
});

/**
 * GET /api/items — feed items. `?section=<slug>` filters by category;
 * `?sort=` is relevant (default) | recent | stars; `?window=` bounds recency.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    section: searchParams.get("section") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    window: searchParams.get("window") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid query parameters." },
      { status: 400 },
    );
  }

  try {
    const category = categoryForSlug(parsed.data.section);
    const sort: FeedSort = parsed.data.sort === "stars" ? "metric" : parsed.data.sort;
    // Personalize to the caller when signed in (2.2); anon reads the shared feed
    // via the auth-aware client (RLS anon-read), never service-role.
    const client = await createServerSupabaseClient();
    const user = await getSessionUser();
    const items = await getFeedItems(
      {
        category,
        sort,
        window: parsed.data.window,
        limit: parsed.data.limit,
        userId: user?.id ?? null,
      },
      client,
    );
    return NextResponse.json({
      success: true,
      data: items,
      meta: { total: items.length, limit: parsed.data.limit },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
