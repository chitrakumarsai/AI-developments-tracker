import { NextResponse } from "next/server";
import { z } from "zod";

import { recordVote } from "@/lib/feedback/record";
import { getSessionUser } from "@/lib/auth/session";

/** Untrusted request body: an item uuid and a vote (or null to clear it). */
const bodySchema = z.object({
  itemId: z.string().uuid(),
  value: z.enum(["up", "down"]).nullable(),
});

/**
 * POST /api/feedback — persist a thumbs up/down (or clear it) on an item.
 * Personalization requires sign-in (2.1 access model): anonymous callers get 401
 * and the client nudges them to /sign-in. The write still runs via the
 * service-role client in `recordVote`; per-user scoping (`user_id`) lands in 2.2.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: "Sign in to rate items." },
      { status: 401 },
    );
  }

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
