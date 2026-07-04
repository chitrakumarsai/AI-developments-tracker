import { NextResponse } from "next/server";
import { z } from "zod";

import { createCandidate } from "@/lib/candidates/persist";

/** Untrusted body: a proposed source for the rating queue. */
const bodySchema = z.object({
  platform: z.string().trim().min(1).max(40),
  handleOrUrl: z.string().trim().min(1).max(500),
  whySuggested: z.string().trim().max(500).optional(),
});

/**
 * POST /api/candidates — add a source to the rating queue (state=suggested).
 * The URL is validated for real only at promote time; here we just store the
 * sanitized proposal. Phase 1: not user-scoped.
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
      { success: false, data: null, error: "Invalid candidate payload." },
      { status: 400 },
    );
  }

  try {
    await createCandidate(parsed.data);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
