/**
 * Shared networking helpers for ingestion connectors (§12.7).
 *
 * The SSRF guard and fetch constants live here so every connector — RSS, API,
 * and future ones — enforces the same rules instead of copying them.
 */

export const FETCH_TIMEOUT_MS = 15_000;
export const USER_AGENT = "AIChronicles/0.1 (+https://github.com/ai-developments-tracker)";

const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local / cloud metadata (IMDS)
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.local$/i,
];

/**
 * SSRF guard: a URL must be http/https and must not point at a private,
 * loopback, or link-local host. Returns an error message if unsafe, else null.
 * Source rows are untrusted once a UI can add them.
 */
export function unsafeUrlReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `disallowed scheme "${parsed.protocol}"`;
  }
  if (PRIVATE_HOST.some((pattern) => pattern.test(parsed.hostname))) {
    return `private/loopback host "${parsed.hostname}"`;
  }
  return null;
}
