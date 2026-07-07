import "server-only";

import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for write endpoints (2.3 hardening).
 *
 * Backed by Upstash Redis (serverless-friendly, free tier). Provisioned via the
 * Vercel Marketplace, which injects `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN`. When those are absent the limiter **fails open**
 * (allows the request) so the app never hard-breaks on a missing/outaged store —
 * provision Upstash and the limits activate with no code change.
 *
 * Sliding-window limits are deliberately generous for normal use; they exist to
 * blunt scripted abuse and runaway clients, not to throttle real users.
 */
export type RateLimitBucket = "feedback" | "candidates" | "cron";

const LIMITS: Record<RateLimitBucket, { tokens: number; window: `${number} s` }> = {
  feedback: { tokens: 60, window: "60 s" },
  candidates: { tokens: 20, window: "60 s" },
  cron: { tokens: 10, window: "60 s" },
};

function readUpstashEnv(): { url: string; token: string } | null {
  // Vercel's Upstash/KV Marketplace integration injects KV_REST_API_URL/TOKEN;
  // a manual Upstash setup uses UPSTASH_REDIS_REST_URL/TOKEN. Accept either.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

// Module-scoped singletons: reused across invocations within a warm instance.
let redis: Redis | null = null;
const limiters = new Map<RateLimitBucket, Ratelimit>();
let warnedDisabled = false;

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  const env = readUpstashEnv();
  if (!env) {
    if (!warnedDisabled) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting disabled (fail-open).",
      );
      warnedDisabled = true;
    }
    return null;
  }

  if (!redis) redis = new Redis({ url: env.url, token: env.token });

  const existing = limiters.get(bucket);
  if (existing) return existing;

  const cfg = LIMITS[bucket];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
    prefix: `rl:${bucket}`,
    analytics: false,
  });
  limiters.set(bucket, limiter);
  return limiter;
}

/**
 * Best-effort client IP from proxy headers. Vercel sets `x-forwarded-for`; take
 * the left-most (original client) entry. Used to key limits for endpoints with
 * no authenticated user (e.g. cron).
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Enforce the limit for `bucket` keyed by `identifier`. Returns a ready-to-return
 * 429 `NextResponse` (with `Retry-After`) when the caller is over the limit, or
 * `null` when the request may proceed. Fails OPEN on missing config or store
 * error so a write path never dies on the limiter.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<NextResponse | null> {
  const limiter = getLimiter(bucket);
  if (!limiter) return null;

  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await limiter.limit(identifier);
  } catch (error) {
    console.error(
      "[rate-limit] limiter error — failing open:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  if (result.success) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    { success: false, data: null, error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
