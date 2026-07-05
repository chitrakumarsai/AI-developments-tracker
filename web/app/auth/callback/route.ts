import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { safeRedirectPath } from "@/lib/auth/redirect";

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
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=callback`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
