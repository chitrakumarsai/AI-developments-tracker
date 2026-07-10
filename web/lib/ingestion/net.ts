/**
 * Shared networking helpers for ingestion connectors (§12.7).
 *
 * The SSRF guard and fetch constants live here so every connector — RSS, API,
 * and future ones — enforces the same rules instead of copying them.
 */

export const FETCH_TIMEOUT_MS = 15_000;
export const USER_AGENT = "AIChronicles/0.1 (+https://github.com/ai-developments-tracker)";

/** Cap on redirect hops so a redirect loop can't spin forever. */
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Minimal response shape our fetchers read (a subset of the Fetch Response). */
export type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  /** Present on redirect responses so we can read `Location`. */
  headers?: { get(name: string): string | null };
  /** Present on real responses; used to cap how much body we buffer. */
  body?: ReadableStream<Uint8Array> | null;
};

/** Injectable fetch so callers are unit-testable without real network I/O. */
export type FetchLike = (
  input: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: "follow" | "manual" | "error";
  },
) => Promise<FetchResponse>;

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

/**
 * Fetch `url`, following redirects MANUALLY so the SSRF guard runs on every hop
 * (§12.7).
 *
 * Default `fetch` follows 3xx transparently, which would let a public URL bounce
 * to a private/loopback/metadata host and bypass the pre-fetch check — a source
 * row can be added by any signed-in user, and a sitemap it points at can list
 * arbitrary URLs. Each hop's target is re-validated before it is requested.
 *
 * Returns the final response, or a reason string if any hop is unsafe or the
 * chain is too long. Never throws for control flow (network errors bubble).
 *
 * Every ingestion fetcher must go through this, not bare `fetch`.
 */
export async function fetchFollowingSafeRedirects(
  url: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<{ res: FetchResponse } | { reason: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const unsafe = unsafeUrlReason(current);
    if (unsafe) return { reason: unsafe };

    const res = await fetchImpl(current, {
      signal,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, ...headers },
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

/** Hard ceiling on a body we will buffer (a hostile sitemap could be gigabytes). */
export const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MiB

/**
 * Read a response body as text, refusing to buffer more than `maxBytes`.
 *
 * `response.text()` buffers the whole body regardless of size, so an attacker
 * controlling a source URL could OOM the ingestion worker. Streams and aborts
 * once the cap is passed. Falls back to `text()` when the runtime gives no
 * stream (e.g. a stubbed response in tests) — the cap is then applied to the
 * decoded string.
 */
export async function readTextCapped(
  res: FetchResponse,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<string> {
  const stream = res.body;
  if (!stream) {
    const text = await res.text();
    if (text.length > maxBytes) throw new Error(`body exceeds ${maxBytes} bytes`);
    return text;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`body exceeds ${maxBytes} bytes`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
