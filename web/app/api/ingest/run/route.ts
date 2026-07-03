import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerClient } from "@/lib/supabase/server";
import { runIngestion } from "@/lib/ingestion/run";
import { isAuthorizedCron } from "@/lib/http/cron-auth";

const querySchema = z.object({ source: z.string().min(1).default("all") });

/**
 * POST /api/ingest/run?source=<id|all> — manual ingestion trigger.
 *
 * Shares the guard + loop with the scheduled cron route (§6/§7): same auth
 * (`isAuthorizedCron`) and the same resilient `runIngestion` helper, just
 * without the due-filter — a manual run ingests the requested source(s)
 * immediately. Sources whose `ingestion_type` has no connector yet are skipped
 * with a warning inside the summary.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { success: false, data: null, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    source: searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid source parameter." },
      { status: 400 },
    );
  }

  try {
    const client = getServerClient();
    const summary = await runIngestion(client, { sourceId: parsed.data.source });
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Ingestion failed.";
    console.error(`[ingest/run] run failed: ${detail}`);
    const message =
      process.env.NODE_ENV === "production" ? "Ingestion failed." : detail;
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
