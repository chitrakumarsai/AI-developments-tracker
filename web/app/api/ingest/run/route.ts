import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerClient } from "@/lib/supabase/server";
import { arxivConnector } from "@/lib/ingestion/rss/arxiv";
import { persistItems } from "@/lib/ingestion/persist";
import type { SourceRow } from "@/lib/supabase/types";

const querySchema = z.object({ source: z.string().min(1).default("all") });

/**
 * POST /api/ingest/run?source=<id|all> — manual ingestion trigger.
 *
 * Subphase 1.1: every active source is arXiv RSS, so all are dispatched to the
 * arXiv connector. The catalog-driven dispatcher (by `ingestion_type`) arrives
 * in 1.2; scheduled refresh in 1.3. Not the cron route.
 */
export async function POST(request: Request) {
  // Auth: when CRON_SECRET is configured (any deployed env, and required once
  // the 1.3 Vercel Cron wiring lands) the caller must present it. Unset locally
  // for single-user dev convenience. TODO(1.3): make the secret mandatory and
  // share this guard with the scheduled-refresh route.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("x-cron-secret") !== cronSecret) {
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

  const client = getServerClient();
  let query = client
    .from("sources")
    .select("*")
    .eq("status", "active")
    .eq("ingestion_type", "rss");
  if (parsed.data.source !== "all") {
    query = query.eq("id", parsed.data.source);
  }

  const { data: sources, error } = await query;
  if (error) {
    return NextResponse.json(
      { success: false, data: null, error: error.message },
      { status: 500 },
    );
  }

  const perSource = [];
  for (const source of (sources ?? []) as SourceRow[]) {
    const ingestion = await arxivConnector({
      id: source.id,
      name: source.name,
      category: source.category,
      url: source.url,
      tags: source.tags,
    });
    const outcome = await persistItems(client, ingestion);
    perSource.push({ source: source.name, ...outcome });
  }

  const added = perSource.reduce((sum, r) => sum + r.added, 0);
  return NextResponse.json({
    success: true,
    data: { added, sources: perSource.length, perSource },
  });
}
