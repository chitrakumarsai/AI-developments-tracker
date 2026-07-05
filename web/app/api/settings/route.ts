import { NextResponse } from "next/server";

import { saveSettings } from "@/lib/settings/persist";
import { normalizeSettings } from "@/lib/settings/normalize";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

/**
 * POST /api/settings — persist the signed-in user's feed settings (2.2, per-user).
 * Anonymous callers get 401. The body is untrusted, so `normalizeSettings` clamps
 * every field before it is stored (§12.7); the write is RLS-scoped to the user.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: "Sign in to save settings." },
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

  const settings = normalizeSettings(raw);
  try {
    const client = await createServerSupabaseClient();
    await saveSettings(settings, user.id, client);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
