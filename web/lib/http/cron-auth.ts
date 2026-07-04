import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authorize a scheduled-refresh (cron) request.
 *
 * The endpoint is an untrusted external trigger surface (CLAUDE.md §12.5/§21),
 * so it must reject anything that does not present the shared secret:
 *   - Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 *   - A manual trigger may instead send the `x-cron-secret` header.
 *
 * When `CRON_SECRET` is unset (or empty) the guard fails **closed** in any
 * deployed environment (Vercel preview/production, or a production build) so a
 * forgotten/blank secret can never expose the ingest endpoints on a public URL.
 * It stays open only on the local single-user dev box, matching the manual
 * ingest route's Phase 1 behavior.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const isDeployed =
      process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
    return !isDeployed;
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");

  return (
    (bearer != null && constantTimeEqual(bearer, secret)) ||
    (headerSecret != null && constantTimeEqual(headerSecret, secret))
  );
}

/**
 * Constant-time string comparison. Both sides are SHA-256 hashed first so the
 * comparison is over fixed-length buffers — this avoids `timingSafeEqual`
 * throwing on length mismatch and avoids leaking the secret's length.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}
