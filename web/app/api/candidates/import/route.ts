import { NextResponse } from "next/server";
import { z } from "zod";

import { addCandidates, type NewCandidate } from "@/lib/candidates/persist";
import { extractCandidateUrls } from "@/lib/candidates/extract";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

/** Untrusted body: a pasted list/article to mine for candidate URLs. */
const bodySchema = z.object({
  platform: z.string().trim().min(1).max(40),
  text: z.string().min(1).max(20_000),
  whySuggested: z.string().trim().max(500).optional(),
});

/**
 * POST /api/candidates/import — extract http(s) URLs from a pasted blob and add
 * each new one to the rating queue (state=suggested). We do NOT fetch the URLs
 * here (no SSRF surface); real feed validation happens at promote time. Dupes
 * against the queue and live sources are skipped. Owner-only (2.2).
 */
export async function POST(request: Request) {
  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, data: null, error: guard.error },
      { status: guard.status },
    );
  }

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
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
      { success: false, data: null, error: "Invalid import payload." },
      { status: 400 },
    );
  }

  const { platform, text, whySuggested } = parsed.data;
  const urls = extractCandidateUrls(text);
  if (urls.length === 0) {
    return NextResponse.json({ success: true, data: { added: 0, skipped: 0 } });
  }

  const inputs: NewCandidate[] = urls.map((handleOrUrl) => ({
    platform,
    handleOrUrl,
    whySuggested,
  }));

  try {
    const result = await addCandidates(inputs);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
