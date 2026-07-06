import { NextResponse } from "next/server";

import { getServerClient } from "@/lib/supabase/server";
import { runIngestion } from "@/lib/ingestion/run";
import { isAuthorizedCron } from "@/lib/http/cron-auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit/limiter";

// Ingestion has side effects and must never be statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/refresh — scheduled refresh (subphase 1.3).
 *
 * Wired to Vercel Cron (see web/vercel.json, daily). Runs every active source
 * that is DUE per its own `refresh_interval` (a 2-day source runs every other
 * tick). Authenticated (§12.5/§21): rejects any caller without the shared
 * secret. Logic lives in the unit-tested `runIngestion` + `isAuthorizedCron`;
 * this handler is a thin, resilient wrapper.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { success: false, data: null, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const limited = await enforceRateLimit("cron", clientIp(request));
  if (limited) return limited;

  try {
    const client = getServerClient();
    const summary = await runIngestion(client, { dueOnly: true });
    // Lightweight observability (§8.4): one structured line per run.
    console.info(`[cron/refresh] ${JSON.stringify(summary)}`);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Ingestion failed.";
    console.error(`[cron/refresh] run failed: ${detail}`);
    // Detail is useful locally; keep it out of production responses.
    const message =
      process.env.NODE_ENV === "production" ? "Ingestion failed." : detail;
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
