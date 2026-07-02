/**
 * Text sanitization for untrusted ingested content (CLAUDE.md §12.7).
 *
 * Feed fields — titles, abstracts, author names — are UNTRUSTED input. Before
 * storing or rendering, strip markup, decode common HTML entities, and
 * normalize whitespace. Output is plain text, safe to render via React's
 * default escaping (never via dangerouslySetInnerHTML).
 */

const HTML_TAG = /<[^>]*>/g;
const WHITESPACE = /\s+/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const MAX_CODEPOINT = 0x10ffff;

/**
 * Convert a numeric code point to a character, rejecting anything unsafe:
 * out-of-range values (which would throw a RangeError), C0/C1 control
 * characters, and bidirectional-override/zero-width characters that can be used
 * to visually spoof titles and author names.
 */
function codePointToSafeChar(code: number): string | null {
  if (Number.isNaN(code) || code < 0x20 || code > MAX_CODEPOINT) return null;
  if (code >= 0x7f && code <= 0x9f) return null; // C1 controls
  if (code >= 0x200b && code <= 0x200f) return null; // zero-width + directional marks
  if (code >= 0x202a && code <= 0x202e) return null; // bidi overrides
  if (code >= 0x2066 && code <= 0x2069) return null; // bidi isolates
  return String.fromCodePoint(code);
}

function decodeEntity(match: string, body: string): string {
  const lower = body.toLowerCase();
  if (lower.startsWith("#x")) {
    return codePointToSafeChar(Number.parseInt(body.slice(2), 16)) ?? match;
  }
  if (body.startsWith("#")) {
    return codePointToSafeChar(Number.parseInt(body.slice(1), 10)) ?? match;
  }
  return NAMED_ENTITIES[lower] ?? match;
}

/**
 * Strip HTML, decode entities, collapse whitespace, and trim.
 * Returns an empty string for null/undefined/empty/non-string input.
 *
 * Accepts `unknown` on purpose: feeds are untrusted (§12.7) and some deliver
 * non-string fields (e.g. Atom `<author>` objects), which must never crash the
 * connector. Callers needing structured values extract them first (see
 * rss.ts `readAuthor`).
 */
export function sanitizeText(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  const withoutTags = raw.replace(HTML_TAG, " ");
  const decoded = withoutTags.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    decodeEntity,
  );
  return decoded.replace(WHITESPACE, " ").trim();
}

const SAFE_URL_SCHEMES = new Set(["http:", "https:"]);

/**
 * Validate an untrusted link from a feed. Returns the normalized URL only if it
 * uses a safe scheme (http/https) — blocks `javascript:`, `data:`, `file:`,
 * etc. Returns an empty string for anything unsafe or unparseable, so callers
 * can skip the item.
 */
export function sanitizeUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = new URL(raw.trim());
    return SAFE_URL_SCHEMES.has(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
