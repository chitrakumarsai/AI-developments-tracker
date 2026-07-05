import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteView } from "@/lib/views/persist";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

/** Untrusted body: the uuid of the view to delete. */
const bodySchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/views/delete — remove one of the user's saved filter presets. POST
 * (not DELETE) so a plain client `fetch` body works uniformly with the other
 * write routes. Per-user (2.2): anonymous callers get 401; the delete is scoped
 * to the signed-in user by both RLS and an explicit `user_id` match.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: "Sign in to manage views." },
      { status: 401 },
    );
  }

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
      { success: false, data: null, error: "Invalid payload." },
      { status: 400 },
    );
  }

  try {
    const client = await createServerSupabaseClient();
    await deleteView(parsed.data.id, user.id, client);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
