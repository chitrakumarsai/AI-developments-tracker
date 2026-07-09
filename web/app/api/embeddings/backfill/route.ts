import { NextResponse } from "next/server";

import { backfillItemEmbeddings } from "@/lib/embeddings/backfill";
import { getServerClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/embeddings/backfill — owner-only: embed a batch of items that have
 * no vector yet (catch-up for the existing corpus / when embed-on-ingest was
 * down). Bounded per call; re-run until `scanned` is 0. Uses the service client
 * to update the shared corpus, so `requireOwner` is the sole authz boundary.
 */
export async function POST() {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  try {
    const result = await backfillItemEmbeddings(getServerClient());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "Backfill failed.");
  }
}
