import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the request's cookies, using the ANON key
 * (2.1). This is the auth-aware client: it reads/writes the session in httpOnly
 * cookies via @supabase/ssr (never localStorage — CLAUDE.md §21, ECC react/security).
 * The service-role client in `server.ts` stays for ingestion; this one carries the
 * signed-in user's identity so RLS (2.2) can scope reads/writes to `auth.uid()`.
 *
 * `setAll` is a no-op when called during a Server Component render (cookies are
 * read-only there); the middleware refreshes the session cookie on every request,
 * so that path does not need to write.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — cookies are read-only here.
          // The middleware owns session-cookie refresh, so this is safe to ignore.
        }
      },
    },
  });
}
