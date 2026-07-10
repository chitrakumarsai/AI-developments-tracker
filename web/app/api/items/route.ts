import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getFeedItems,
  DEFAULT_FEED_LIMIT,
  DEFAULT_WINDOW,
  MAX_FEED_LIMIT,
  type FeedSort,
} from "@/lib/feed/queries";
import { categoriesForSlug, categoryForSlug } from "@/lib/feed/categories";
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

  // Gated app data (2.4): the feed is not part of the public surface — only the
  // landing teaser is. Anonymous callers get 401 (the page-level gate redirects;
  // this closes the JSON endpoint a direct caller would otherwise scrape).
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: "Sign in required." },
      { status: 401 },
    );
  }

  try {
    const category = categoryForSlug(parsed.data.section);
    // Multi-category sections (the More catch-all, and the legacy `products`
    // slug that now aliases to it) carry `categories` instead of a single
    // `category`. Without this the route would silently return the *whole*
    // feed for `?section=more`.
    const categories = categoriesForSlug(parsed.data.section);
    const sort: FeedSort = parsed.data.sort === "stars" ? "metric" : parsed.data.sort;
    // Personalize to the signed-in caller (2.2), via the auth-aware client (RLS
    // scopes per-user rows to auth.uid()), never service-role.
    const client = await createServerSupabaseClient();
    const items = await getFeedItems(
      {
        category,
        categories: categories ?? undefined,
        sort,
        window: parsed.data.window,
        limit: parsed.data.limit,
        userId: user.id,
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
