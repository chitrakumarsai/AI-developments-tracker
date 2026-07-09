import { NextResponse } from "next/server";

import { refreshPromptView } from "@/lib/products/service";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/products/[id]/refresh — re-run the view's semantic search against
 * the current corpus and replace its snapshot. Per-user (auth-aware client);
 * rate-limited (embedding + LLM rerank). 404 when the view isn't the user's.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Sign in required.");

  const limited = await enforceRateLimit("products", `user:${user.id}`);
  if (limited) return limited;

  const { id } = await params;
  try {
    const client = await createServerSupabaseClient();
    const ok = await refreshPromptView(id, user.id, client);
    if (!ok) return fail(404, "View not found.");
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "Could not refresh the view.");
  }
}
