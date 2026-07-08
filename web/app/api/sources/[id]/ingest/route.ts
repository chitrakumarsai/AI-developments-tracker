import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerClient } from "@/lib/supabase/server";
import { runIngestion } from "@/lib/ingestion/run";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/sources/[id]/ingest — owner-only: run ingestion for one source now.
 *
 * The shared cron route (`/api/ingest/run`) is guarded by the server-only
 * CRON_SECRET and so can't be called from the browser. This owner-gated sibling
 * runs the SAME resilient `runIngestion` helper for a single source after
 * `requireOwner`, so the manual "Ingest now" button never needs a secret. The
 * run uses the service-role client (ingestion bypasses RLS by design), making
 * `requireOwner` the sole authorization boundary in front of it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail(400, "Invalid source id.");
  }

  try {
    const summary = await runIngestion(getServerClient(), { sourceId: id });
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Ingestion failed.";
    console.error(`[sources/ingest] run failed: ${detail}`);
    const message = process.env.NODE_ENV === "production" ? "Ingestion failed." : detail;
    return fail(500, message);
  }
}
