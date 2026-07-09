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

/**
 * True when a *resolved* IP address falls in a private/loopback/link-local
 * range. `unsafeUrlReason` only inspects the hostname string; this checks the
 * address a hostname actually resolves to, so a caller that resolves DNS first
 * can defend against DNS-rebinding (a public-looking host pointing at
 * 127.x/10.x/169.254.x metadata). The IP-shaped `PRIVATE_HOST` patterns cover
 * IPv4 + `::1`; the extra checks cover common IPv6 private/mapped forms.
 */
export function ipIsPrivate(ip: string): boolean {
  if (PRIVATE_HOST.some((pattern) => pattern.test(ip))) return true;
  const v6 = ip.toLowerCase();
  // Unique-local (fc00::/7), link-local (fe80::/10), and IPv4-mapped loopback.
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
  if (v6.startsWith("::ffff:")) return PRIVATE_HOST.some((p) => p.test(v6.slice(7)));
  return false;
}
