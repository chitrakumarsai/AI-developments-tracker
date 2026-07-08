import { NextResponse } from "next/server";
import { z } from "zod";

import { createSource } from "@/lib/sources/persist";
import { validateFeedUrl } from "@/lib/candidates/validate";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

/** Untrusted body: the catalog metadata for a new source. Bounds mirror promote. */
const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500),
  category: z.string().trim().min(1).max(80),
  ingestionType: z.enum(["rss", "api", "scrape", "manual"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/sources — owner-only: add a source straight to the live catalog.
 *
 * Feed validation (SSRF guard + RSS parse) runs BEFORE any write, so an unsafe or
 * unreachable URL is rejected (422) with a reason and no row is created (§12.7).
 * Owner-only (2.2): this writes the shared `sources` catalog every user's feed
 * reads from. The write uses the service-role client, so `requireOwner` is the
 * sole authorization boundary here — matching the owner-only RLS on the table.
 */
export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "Invalid source payload.");

  try {
    const check = await validateFeedUrl(parsed.data.url, parsed.data.ingestionType);
    if (!check.ok) return fail(422, `Feed validation failed: ${check.reason}`);

    const { id } = await createSource({
      name: parsed.data.name,
      category: parsed.data.category,
      url: parsed.data.url,
      ingestionType: parsed.data.ingestionType,
      tags: parsed.data.tags,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    // Redact raw DB errors in production (they can leak schema/constraint names);
    // keep the detail in dev. Mirrors the ingest route's prod-vs-dev handling.
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error(`[sources] create failed: ${detail}`);
    const message = process.env.NODE_ENV === "production" ? "Could not add source." : detail;
    return fail(500, message);
  }
}
