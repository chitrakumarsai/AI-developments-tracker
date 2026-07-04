import { NextResponse } from "next/server";
import { z } from "zod";

import { createView } from "@/lib/views/persist";
import { normalizeFilters } from "@/lib/views/href";

/** Untrusted body: a preset name and a filters blob (re-normalized before storage). */
const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: z.record(z.string(), z.unknown()).default({}),
});

/**
 * POST /api/views — save the current filter set as a named preset. The filters
 * blob is normalized (unknown keys dropped, enums validated) before it's stored,
 * so a saved view can never round-trip into an unsafe URL. Phase 1: not
 * user-scoped.
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
      { success: false, data: null, error: "Invalid view payload." },
      { status: 400 },
    );
  }

  try {
    await createView({
      name: parsed.data.name,
      filters: normalizeFilters(parsed.data.filters),
    });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
