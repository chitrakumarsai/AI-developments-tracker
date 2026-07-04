import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteView } from "@/lib/views/persist";

/** Untrusted body: the uuid of the view to delete. */
const bodySchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/views/delete — remove a saved filter preset. POST (not DELETE) so a
 * plain client `fetch` body works uniformly with the other write routes.
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
    await deleteView(parsed.data.id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
