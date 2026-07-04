import { NextResponse } from "next/server";
import { z } from "zod";

import { recordVote } from "@/lib/feedback/record";

/** Untrusted request body: an item uuid and a vote (or null to clear it). */
const bodySchema = z.object({
  itemId: z.string().uuid(),
  value: z.enum(["up", "down"]).nullable(),
});

/**
 * POST /api/feedback — persist a thumbs up/down (or clear it) on an item.
 * Phase 1 is single-user, so no auth/user scoping yet; the write runs with the
 * server-only service-role client inside `recordVote`.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid feedback payload." },
      { status: 400 },
    );
  }

  try {
    await recordVote(parsed.data);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
