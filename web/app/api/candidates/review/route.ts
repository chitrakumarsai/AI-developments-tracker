import { NextResponse } from "next/server";
import { z } from "zod";

import { reviewCandidate } from "@/lib/candidates/persist";
import { requireOwner } from "@/lib/auth/session";

/** Untrusted body: rate a candidate (1..5) or skip it. */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().uuid(), action: z.literal("rate"), rating: z.number().int().min(1).max(5) }),
  z.object({ id: z.string().uuid(), action: z.literal("skip") }),
]);

/** POST /api/candidates/review — rate or skip a queued candidate. Owner-only (2.2). */
export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, data: null, error: guard.error },
      { status: guard.status },
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
      { success: false, data: null, error: "Invalid review payload." },
      { status: 400 },
    );
  }

  try {
    const { id, ...review } = parsed.data;
    await reviewCandidate(id, review);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
