import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { syncProfileOnSignIn } from "@/lib/auth/profile";

/**
 * OAuth / magic-link callback. The provider redirects here with a `code`; we
 * exchange it for a session (written to httpOnly cookies by the SSR client) and
 * bounce the user to their validated `next` path. Any failure fails soft back to
 * /sign-in rather than exposing an error. `next` is passed through the
 * open-redirect guard so a tampered callback URL can't off-site the user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=callback`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/sign-in?error=callback`);
  }

  // First moment we hold a verified identity: upsert the profile (owner role is
  // derived server-side from OWNER_EMAIL) and, for the owner, backfill Phase-1
  // data. Never blocks sign-in — it self-heals on the next sign-in on failure.
  await syncProfileOnSignIn({ id: data.user.id, email: data.user.email ?? null });

  return NextResponse.redirect(`${origin}${next}`);
}
