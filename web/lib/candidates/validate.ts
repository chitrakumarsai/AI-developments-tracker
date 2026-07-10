import "server-only";

import {
  FETCH_TIMEOUT_MS,
  fetchFollowingSafeRedirects,
  readTextCapped,
  safeFetch,
  unsafeUrlReason,
  type FetchLike,
  type FetchResponse,
} from "../ingestion/net";
import { parseRssFeed } from "../ingestion/rss/rss";

/** Outcome of validating a candidate's feed/URL before it becomes a live source. */
export type FeedValidation = {
  ok: boolean;
  /** Why validation failed (safe to show the user); absent on success. */
  reason?: string;
  /** Number of items parsed from the feed (RSS only); absent otherwise. */
  sampleCount?: number;
};

/** Re-exported so existing importers (and tests) keep one source of truth. */
export type { FetchLike, FetchResponse };

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
  fetchImpl: FetchLike = safeFetch as unknown as FetchLike,
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
    body = await readTextCapped(res);
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
