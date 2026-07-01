import { NextResponse } from "next/server";
import { z } from "zod";

import { getRecentItems, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from "@/lib/feed/queries";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
});

/** GET /api/items — recent feed items, newest first. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid query parameters." },
      { status: 400 },
    );
  }

  try {
    const items = await getRecentItems(parsed.data.limit);
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
