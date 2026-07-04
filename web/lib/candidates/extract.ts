/**
 * Extract candidate feed/source URLs from a pasted blob of text (§12.7).
 *
 * The user pastes a "who/what to follow" article or a bare list; we pull the
 * http(s) URLs out of it, normalize + dedupe them, and cap the count so one
 * paste can't bulk-insert unbounded rows. Pure and side-effect-free — the
 * pasted text is untrusted, but we never fetch these URLs here: real feed
 * validation happens later at promote time.
 */

import { sanitizeUrl } from "../ingestion/sanitize";

/** Upper bound on URLs pulled from a single paste. */
export const MAX_IMPORT_URLS = 50;

/** Drop absurdly long tokens before they reach sanitize/normalize. */
const MAX_URL_LENGTH = 500;

// Match http(s) URLs; stop at whitespace and characters that usually *close*
// a URL in prose or markup so we don't swallow trailing brackets/quotes.
const URL_RE = /https?:\/\/[^\s<>"'\]})]+/gi;

// Trailing sentence punctuation that commonly follows a URL in prose.
const TRAILING_PUNCT = /[.,;:!?]+$/;

/**
 * Normalize a URL for dedupe: lowercase host, drop the fragment, strip a
 * trailing slash. Used both within a paste and against already-known URLs.
 * Falls back to a trimmed lowercase string if the URL won't parse.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Pull unique, safe http(s) URLs out of pasted text. Unsafe schemes never
 * match the pattern; sanitizeUrl double-guards. Deduped by normalized form and
 * capped at MAX_IMPORT_URLS. Non-string / empty input → `[]`.
 */
export function extractCandidateUrls(text: unknown): string[] {
  if (typeof text !== "string" || !text) return [];

  const matches = text.match(URL_RE) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const trimmed = match.replace(TRAILING_PUNCT, "").slice(0, MAX_URL_LENGTH);
    const safe = sanitizeUrl(trimmed);
    if (!safe) continue;

    const key = normalizeUrl(safe);
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(safe);
    if (out.length >= MAX_IMPORT_URLS) break;
  }

  return out;
}
