import { NextResponse } from "next/server";
import { z } from "zod";

import { createPromptView } from "@/lib/products/service";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

/** Untrusted body: the title + natural-language prompt for a new view. */
const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(500),
});

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * POST /api/products — create a saved prompt-view for the signed-in user. The
 * prompt is embedded, items are retrieved by vector similarity and LLM-reranked,
 * and the snapshot is stored. Per-user (RLS via the auth-aware client); rate-
 * limited because each call does an embedding + an LLM rerank.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Sign in required.");

  const limited = await enforceRateLimit("products", `user:${user.id}`);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Body must be JSON.");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "Invalid view payload.");

  try {
    const client = await createServerSupabaseClient();
    const { id } = await createPromptView(parsed.data, user.id, client);
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "Could not create the view.");
  }
}
