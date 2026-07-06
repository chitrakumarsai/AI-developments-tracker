import { NextResponse } from "next/server";
import { z } from "zod";

import { recordVote } from "@/lib/feedback/record";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

/** Untrusted request body: an item uuid and a vote (or null to clear it). */
const bodySchema = z.object({
  itemId: z.string().uuid(),
  value: z.enum(["up", "down"]).nullable(),
});

/**
 * POST /api/feedback — persist a thumbs up/down (or clear it) on an item.
 * Personalization requires sign-in (2.1 access model): anonymous callers get 401
 * and the client nudges them to /sign-in. The vote is written per-user (2.2) via
 * the auth-aware client, so RLS scopes it to the signed-in user's own rows.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: "Sign in to rate items." },
      { status: 401 },
    );
  }

  const limited = await enforceRateLimit("feedback", `user:${user.id}`);
  if (limited) return limited;

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
    const client = await createServerSupabaseClient();
    await recordVote(parsed.data, user.id, client);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
