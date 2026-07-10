import { test as setup } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "undici";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// supabase-js constructs a RealtimeClient eagerly; Node 20 has no global WebSocket.
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

export const OWNER_STATE = "e2e/.auth/owner.json";

/** Read `.env.local` — Playwright's process doesn't get Next's env loading. */
function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

type Cookie = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Sign in as the owner once and save the session cookies, so the gated pages
 * (/feed, /sources, /settings) can be exercised by E2E without a real inbox.
 *
 * The app's callback is PKCE (`exchangeCodeForSession`), so simply visiting an
 * admin-generated magic link fails: the code-verifier cookie was never set by
 * this browser. Instead we redeem the link's `hashed_token` server-side through
 * `@supabase/ssr` itself, capturing whatever cookies it writes. That way the
 * cookie names, chunking and encoding always match what the app reads — no
 * hand-rolled cookie format to drift.
 */
setup("authenticate as owner", async () => {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const email = env.OWNER_EMAIL;
  if (!url || !anonKey || !serviceKey || !email) {
    throw new Error("auth.setup needs NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SERVICE_ROLE_KEY, OWNER_EMAIL");
  }

  // 1. Mint a one-time token for the owner (no email is sent).
  const admin = createClient(url, serviceKey);
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message ?? "no hashed_token"}`);
  }

  // 2. Redeem it through the SSR client, capturing the cookies it sets.
  const jar: Cookie[] = [];
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.map(({ name, value }) => ({ name, value })),
      setAll: (cookies) => {
        for (const cookie of cookies) {
          const existing = jar.findIndex((c) => c.name === cookie.name);
          if (existing >= 0) jar[existing] = cookie;
          else jar.push(cookie);
        }
      },
    },
  });
  const { error: otpError } = await ssr.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (otpError) throw new Error(`verifyOtp failed: ${otpError.message}`);
  if (jar.length === 0) throw new Error("no session cookies were written");

  // 3. Hand them to Playwright as storage state.
  const state = {
    cookies: jar.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };
  mkdirSync(dirname(OWNER_STATE), { recursive: true });
  writeFileSync(OWNER_STATE, JSON.stringify(state, null, 2));
});
