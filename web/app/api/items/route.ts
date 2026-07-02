import { NextResponse } from "next/server";
import { z } from "zod";

import { getRecentItems, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from "@/lib/feed/queries";
import { categoryForSlug } from "@/lib/feed/categories";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
  section: z.string().optional(),
  sort: z.enum(["recent", "stars"]).default("recent"),
});

/**
 * GET /api/items — recent feed items. `?section=<slug>` filters by category;
 * `?sort=stars` orders by popularity metric (stars/likes) instead of recency.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    section: searchParams.get("section") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid query parameters." },
      { status: 400 },
    );
  }

  try {
    const category = categoryForSlug(parsed.data.section);
    const sort = parsed.data.sort === "stars" ? "metric" : "recent";
    const items = await getRecentItems(parsed.data.limit, category, sort);
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
