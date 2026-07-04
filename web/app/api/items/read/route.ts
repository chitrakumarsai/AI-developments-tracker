import { NextResponse } from "next/server";
import { z } from "zod";

import { markRead } from "@/lib/feedback/record";

/** Untrusted request body: the uuid of the item the user opened. */
const bodySchema = z.object({ itemId: z.string().uuid() });

/**
 * POST /api/items/read — mark an item as read (user opened it at the source).
 * Called via `navigator.sendBeacon`, so it must accept a plain JSON body and
 * return quickly. Idempotent.
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
      { success: false, data: null, error: "Invalid payload." },
      { status: 400 },
    );
  }

  try {
    await markRead(parsed.data.itemId);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
