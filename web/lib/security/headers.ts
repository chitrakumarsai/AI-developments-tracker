/**
 * Security headers + Content-Security-Policy for 2.3 hardening.
 *
 * Static headers (HSTS, nosniff, frame, referrer, permissions) are applied
 * broadly via `next.config.ts` `headers()`. The CSP is per-request because it
 * carries a fresh nonce, so it is built here and set in `middleware.ts`; Next
 * reads the nonce from the request's CSP header and stamps it onto its own
 * bootstrap scripts, letting us avoid `'unsafe-inline'` for scripts.
 *
 * See ECC web/security.md (nonce-based CSP over `'unsafe-inline'`).
 */

/** Static response headers, safe to cache and apply to every route. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // 2 years, subdomains, preload-eligible. HTTPS is enforced by Vercel.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundant with CSP frame-ancestors, but covers older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
  },
  // Isolate the browsing context. `allow-popups` keeps a future popup-based
  // OAuth flow working; today's Supabase OAuth is redirect-based either way.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/**
 * Build the CSP for a single request.
 *
 * @param nonce  Per-request base64 nonce; Next applies it to inline bootstrap scripts.
 * @param opts.supabaseUrl  The project's Supabase origin (for connect-src XHR + realtime wss).
 * @param opts.isDev  Relax script-src with `'unsafe-eval'` for the dev/HMR runtime only.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  opts: { supabaseUrl?: string; isDev?: boolean } = {},
): string {
  const { supabaseUrl, isDev = false } = opts;

  // Supabase browser client talks to REST/Auth over http(s) and Realtime over
  // ws(s). `^http` → `ws` maps https→wss and the local-dev http→ws correctly.
  const connectSrc = ["'self'"];
  if (supabaseUrl) {
    connectSrc.push(supabaseUrl);
    connectSrc.push(supabaseUrl.replace(/^http/, "ws"));
  }

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Tailwind/Next inject inline <style>; nonce-ing styles is impractical and
    // style injection is a low-risk vector, so 'unsafe-inline' is accepted here.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    // Declared explicitly (not left to fall back to default-src) so they stay
    // locked down even if default-src is ever loosened for a CDN.
    "frame-src": ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Auto-upgrade any stray http subresource to https.
  parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
