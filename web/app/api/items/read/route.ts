import { NextResponse } from "next/server";
import { z } from "zod";

import { markRead } from "@/lib/feedback/record";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

/** Untrusted request body: the uuid of the item the user opened. */
const bodySchema = z.object({ itemId: z.string().uuid() });

/**
 * POST /api/items/read — mark an item as read for the signed-in user (2.2,
 * per-user). Called via `navigator.sendBeacon`, so it accepts a plain JSON body
 * and returns quickly. Read-state is private, so anonymous callers are a silent
 * no-op success (nothing to record) rather than an error — sendBeacon can't act
 * on a 401 anyway. Idempotent.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ success: true, data: null });
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
      { success: false, data: null, error: "Invalid payload." },
      { status: 400 },
    );
  }

  try {
    const client = await createServerSupabaseClient();
    await markRead(parsed.data.itemId, user.id, client);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
