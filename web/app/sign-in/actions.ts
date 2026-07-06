"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { safeRedirectPath } from "@/lib/auth/redirect";

const emailSchema = z.string().email();
const OAUTH_PROVIDERS = ["github", "google"] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The app's own origin for building the OAuth/magic-link callback URL. Prefers a
 * server-configured `NEXT_PUBLIC_SITE_URL` so the origin is never taken from an
 * attacker-influenceable `Host`/`X-Forwarded-Host` header (which would let a
 * direct request point the post-sign-in redirect at another origin). The header
 * fallback exists only for local dev where the site URL is unset; in production
 * the configured value plus Supabase's Redirect-URLs allowlist are the guards.
 */
async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Server action backing the /sign-in form. A hidden `intent` field selects the
 * method (github | google | magic); `redirectTo` is the post-sign-in path,
 * validated against the open-redirect guard before it is ever trusted. All three
 * methods route back through /auth/callback so the session lands in httpOnly
 * cookies. Untrusted form input is validated (Zod) at this boundary.
 */
export async function signInAction(formData: FormData): Promise<void> {
  const intent = String(formData.get("intent") ?? "");
  const next = safeRedirectPath(String(formData.get("redirectTo") ?? "/"));
  const origin = await requestOrigin();
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = await createServerSupabaseClient();

  if (isOAuthProvider(intent)) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: intent,
      options: { redirectTo: callbackUrl },
    });
    if (error || !data?.url) redirect(`/sign-in?error=oauth&next=${encodeURIComponent(next)}`);
    redirect(data.url);
  }

  if (intent === "magic") {
    const parsed = emailSchema.safeParse(formData.get("email"));
    if (!parsed.success) redirect(`/sign-in?error=email&next=${encodeURIComponent(next)}`);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: callbackUrl },
    });
    redirect(
      error
        ? `/sign-in?error=magic&next=${encodeURIComponent(next)}`
        : `/sign-in?sent=1&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(`/sign-in?error=unknown&next=${encodeURIComponent(next)}`);
}
