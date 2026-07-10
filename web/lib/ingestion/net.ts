/**
 * Shared networking helpers for ingestion connectors (§12.7).
 *
 * The SSRF guard and fetch constants live here so every connector — RSS, API,
 * and future ones — enforces the same rules instead of copying them.
 */

import { lookup as dnsLookup } from "node:dns";
import { Agent } from "undici";

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

type LookupAddress = { address: string; family: number };
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | LookupAddress[],
  family?: number,
) => void;
type LookupFn = (hostname: string, options: unknown, callback: LookupCallback) => void;

/**
 * A DNS `lookup` that refuses to resolve a hostname to a private address.
 *
 * `unsafeUrlReason` inspects the hostname *string* only, so `rebind.evil.com`
 * passes it and can still answer `127.0.0.1` — or `169.254.169.254` — when the
 * socket is actually opened. Guarding here is the only place that sees the real
 * address, and because undici connects to the address this lookup returns,
 * there is no window between the check and the connect (no TOCTOU).
 *
 * Blocks when ANY resolved address is private: a rebinding host can return one
 * public and one private record, and picking the first would be a coin flip.
 * A resolver error propagates — it must never fail open.
 */
export function createSafeLookup(inner: LookupFn = dnsLookup as unknown as LookupFn): LookupFn {
  return function safeLookup(hostname, options, callback) {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const opts = (typeof options === "function" ? {} : (options ?? {})) as { all?: boolean };

    inner(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = (Array.isArray(addresses) ? addresses : []) as LookupAddress[];
      if (list.length === 0) {
        return cb(new Error(`no address for "${hostname}"`));
      }
      const blocked = list.find((entry) => ipIsPrivate(entry.address));
      if (blocked) {
        return cb(
          new Error(`blocked private address ${blocked.address} for "${hostname}" (DNS rebinding)`),
        );
      }
      if (opts.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

/**
 * The dispatcher every ingestion fetch goes through. Its connect step resolves
 * DNS via `createSafeLookup`, so a rebinding host is refused at the socket.
 */
const safeAgent = new Agent({
  connect: { lookup: createSafeLookup() as never },
});

/**
 * `fetch` for untrusted, catalog-supplied URLs.
 *
 * Delegates to the global fetch (so tests that stub it keep working) but pins
 * the undici dispatcher that carries the DNS guard. Every ingestion connector
 * must use this rather than bare `fetch`.
 */
export const safeFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input as RequestInfo, {
    ...(init ?? {}),
    // Non-standard but honoured by Node's undici-backed fetch.
    dispatcher: safeAgent,
  } as RequestInit);

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
