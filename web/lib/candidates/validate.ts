import "server-only";

import { FETCH_TIMEOUT_MS, USER_AGENT, unsafeUrlReason } from "../ingestion/net";
import { parseRssFeed } from "../ingestion/rss/rss";

/** Outcome of validating a candidate's feed/URL before it becomes a live source. */
export type FeedValidation = {
  ok: boolean;
  /** Why validation failed (safe to show the user); absent on success. */
  reason?: string;
  /** Number of items parsed from the feed (RSS only); absent otherwise. */
  sampleCount?: number;
};

/** Minimal response shape the validator reads (a subset of the Fetch Response). */
export type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  /** Present on redirect responses so we can read `Location`. */
  headers?: { get(name: string): string | null };
};

/** Injectable fetch so the validator is unit-testable without real network I/O. */
export type FetchLike = (
  input: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: "follow" | "manual" | "error";
  },
) => Promise<FetchResponse>;

/** Cap on redirect hops so a redirect loop can't spin forever. */
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch `url`, following redirects MANUALLY so the SSRF guard runs on every hop
 * (§12.7). Default `fetch` follows 3xx transparently, which would let a public
 * URL bounce to a private/loopback/metadata host and bypass the pre-fetch
 * check. Here each hop's target is re-validated before it is requested. Returns
 * the final response, or a reason string if any hop is unsafe or the chain is
 * too long. Never throws for control flow (network errors bubble to the caller).
 */
async function fetchFollowingSafeRedirects(
  url: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<{ res: FetchResponse } | { reason: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const unsafe = unsafeUrlReason(current);
    if (unsafe) return { reason: unsafe };

    const res = await fetchImpl(current, {
      signal,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT },
    });
    if (!REDIRECT_STATUSES.has(res.status)) return { res };

    const location = res.headers?.get("location");
    if (!location) return { reason: `redirect (HTTP ${res.status}) without a location` };
    try {
      current = new URL(location, current).href; // resolve relative Location
    } catch {
      return { reason: "redirect to an invalid location" };
    }
  }
  return { reason: "too many redirects" };
}

/**
 * Validate that a candidate URL is safe and usable before promoting it to a
 * live source. For RSS (the default + the manual path) we also confirm the feed
 * actually parses into ≥1 item. Never throws — returns a reason on any failure,
 * so a bad paste can't crash the promote flow.
 *
 * Untrusted input (§12.7): the SSRF guard runs BEFORE any fetch, so a URL
 * pointing at a private/loopback/metadata host is rejected without a request.
 */
export async function validateFeedUrl(
  url: string,
  ingestionType: "rss" | "api" | "scrape" | "manual" = "rss",
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<FeedValidation> {
  const unsafe = unsafeUrlReason(url);
  if (unsafe) return { ok: false, reason: unsafe };

  // `manual` sources have no feed to fetch — URL safety is the only check.
  if (ingestionType === "manual") return { ok: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let body: string;
  try {
    const outcome = await fetchFollowingSafeRedirects(url, fetchImpl, controller.signal);
    if ("reason" in outcome) return { ok: false, reason: outcome.reason };
    const { res } = outcome;
    if (!res.ok) return { ok: false, reason: `feed returned HTTP ${res.status}` };
    body = await res.text();
  } catch {
    return { ok: false, reason: "could not reach the URL" };
  } finally {
    clearTimeout(timer);
  }

  // Non-RSS types (api/scrape) only need to be reachable at this stage.
  if (ingestionType !== "rss") return { ok: true };

  try {
    const result = await parseRssFeed(body, {
      id: "validate",
      name: "validate",
      category: "validation",
      url,
      tags: [],
    });
    if (result.items.length === 0) {
      return { ok: false, reason: "no items found in the feed" };
    }
    return { ok: true, sampleCount: result.items.length };
  } catch {
    return { ok: false, reason: "URL is not a valid RSS/Atom feed" };
  }
}
