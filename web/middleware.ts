import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "./lib/security/headers";

/**
 * Runs on every non-asset request. Two jobs:
 *  1. (2.1) Refresh the Supabase session cookie so Server Components read an
 *     up-to-date identity. It does NOT gate routes — the public feed stays
 *     public; route/action checks + RLS enforce auth and per-row isolation.
 *  2. (2.3) Emit a per-request nonce-based Content-Security-Policy. The nonce is
 *     forwarded on the request headers so Next stamps it onto its bootstrap
 *     scripts, letting the policy avoid `'unsafe-inline'` for scripts.
 */
export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV !== "production",
  });

  // Forward the nonce + CSP on the request so Next can read the nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without Supabase env there is nothing to refresh; still apply the CSP below.
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Touch the session so an expiring token is refreshed into the response cookie.
    await supabase.auth.getUser();
  }

  // The response CSP must match the nonce forwarded to Next above.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
