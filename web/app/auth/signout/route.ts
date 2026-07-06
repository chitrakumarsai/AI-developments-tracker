import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";

/**
 * Sign the current user out and return to the public feed. POST-only (a
 * state-changing action shouldn't be triggerable by a bare GET/prefetch). The
 * SSR client clears the session cookies as part of `signOut()`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
