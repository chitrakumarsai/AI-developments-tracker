import { NextResponse } from "next/server";

import { runDiscovery } from "@/lib/discovery/discover";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/discovery/run — owner-only: run automated source discovery now
 * (2.4.3). Scans recent items from active sources, tallies recurring outbound
 * hosts, and proposes the top untracked ones as `suggested` candidates for the
 * rating queue. Nothing goes live without the owner's rating.
 *
 * Owner-gated + rate-limited: the run fetches many external pages (an SSRF/DoS
 * surface), all bounded and SSRF-guarded inside `runDiscovery`. `requireOwner`
 * is the authorization boundary in front of that surface.
 */
export async function POST() {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  try {
    const summary = await runDiscovery();
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Discovery failed.";
    console.error(`[discovery] run failed: ${detail}`);
    const message = process.env.NODE_ENV === "production" ? "Discovery failed." : detail;
    return fail(500, message);
  }
}
