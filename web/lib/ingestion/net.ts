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
  // Delegates to `ipIsPrivate` so an IP *literal* in the URL is caught here.
  // It has to be: undici performs no DNS lookup for a literal, so the
  // rebinding guard never sees `http://[::ffff:127.0.0.1]/`.
  if (ipIsPrivate(parsed.hostname)) {
    return `private/loopback host "${parsed.hostname}"`;
  }
  return null;
}

/** Reserved IPv4 blocks, as [network, prefix-length] pairs. */
const PRIVATE_V4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + cloud metadata (IMDS)
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
];

/** Dotted-quad → unsigned 32-bit, or null when it isn't a valid IPv4 literal. */
function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function v4IsPrivate(ip: string): boolean {
  const value = v4ToInt(ip);
  if (value === null) return false;
  return PRIVATE_V4_BLOCKS.some(([network, bits]) => {
    const net = v4ToInt(network);
    if (net === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((net & mask) >>> 0);
  });
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, resolving `::` and any
 * trailing dotted-quad (`::ffff:127.0.0.1`). Returns null for non-IPv6 input.
 */
function v6Groups(ip: string): number[] | null {
  let text = ip;
  if (!text.includes(":")) return null;

  // A trailing dotted-quad occupies the last two groups.
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const value = v4ToInt(dotted[1]);
    if (value === null) return null;
    text = `${text.slice(0, dotted.index)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : NaN));

  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...tail].some((group) => Number.isNaN(group))) return null;

  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    return [...head, ...Array<number>(fill).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}

/**
 * True when a *resolved* IP address falls in a private, loopback, link-local,
 * multicast or otherwise non-routable range.
 *
 * `unsafeUrlReason` only inspects the hostname string; this checks the address a
 * hostname actually resolves to, which is what defends against DNS rebinding
 * (a public-looking host answering 127.x / 169.254.x metadata).
 *
 * Parsed numerically rather than by regex, because the string forms lie:
 * `::ffff:7f00:1` and `64:ff9b::7f00:1` are both 127.0.0.1 wearing a hat, and
 * `0:0:0:0:0:0:0:1` is `::1` written out. Non-IP input falls back to the
 * hostname patterns, so `localhost` and `*.local` still match.
 */
export function ipIsPrivate(ip: string): boolean {
  const text = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (v4ToInt(text) !== null) return v4IsPrivate(text);

  const groups = v6Groups(text);
  if (groups) {
    const [g0] = groups;

    if (groups.every((group) => group === 0)) return true; // :: (unspecified)
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1

    // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) both carry a real
    // IPv4 in the low 32 bits — `::ffff:7f00:1` IS 127.0.0.1.
    const isV4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    const isNat64 =
      g0 === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
    if (isV4Mapped || isNat64) {
      const embedded = ((groups[6] << 16) | groups[7]) >>> 0;
      const asV4 = [embedded >>> 24, (embedded >>> 16) & 255, (embedded >>> 8) & 255, embedded & 255];
      return v4IsPrivate(asV4.join("."));
    }

    if ((g0 & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
    return false;
  }

  // Not an IP literal — fall back to the hostname patterns (localhost, *.local).
  return PRIVATE_HOST.some((pattern) => pattern.test(ip));
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
