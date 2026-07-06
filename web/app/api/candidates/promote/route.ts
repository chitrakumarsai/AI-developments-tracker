import { NextResponse } from "next/server";
import { z } from "zod";

import { getCandidate, promoteCandidate } from "@/lib/candidates/persist";
import { validateFeedUrl } from "@/lib/candidates/validate";
import { requireOwner } from "@/lib/auth/session";

/** Untrusted body: the catalog metadata to promote a candidate with. */
const bodySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  ingestionType: z.enum(["rss", "api", "scrape", "manual"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

/**
 * POST /api/candidates/promote — validate a candidate's feed, then promote it
 * into the live catalog (an active `sources` row) and mark it promoted.
 *
 * Validation runs BEFORE any write and includes the SSRF guard, so an unsafe or
 * unreachable URL is rejected (422) with a reason and no source is created
 * (§12.7 — untrusted external ingestion). Owner-only (2.2): promoting writes the
 * live `sources` catalog that every user's feed reads from.
 */
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
      { success: false, data: null, error: "Invalid promote payload." },
      { status: 400 },
    );
  }

  try {
    const candidate = await getCandidate(parsed.data.id);
    if (!candidate || candidate.state !== "suggested") {
      return NextResponse.json(
        { success: false, data: null, error: "Candidate not found or already decided." },
        { status: 404 },
      );
    }

    const check = await validateFeedUrl(candidate.handle_or_url, parsed.data.ingestionType);
    if (!check.ok) {
      return NextResponse.json(
        { success: false, data: null, error: `Feed validation failed: ${check.reason}` },
        { status: 422 },
      );
    }

    await promoteCandidate(parsed.data.id, {
      name: parsed.data.name,
      category: parsed.data.category,
      url: candidate.handle_or_url,
      ingestionType: parsed.data.ingestionType,
      tags: parsed.data.tags,
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
