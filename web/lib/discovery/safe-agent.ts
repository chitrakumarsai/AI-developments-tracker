import "server-only";

import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import type { Dispatcher } from "undici";

import { ipIsPrivate } from "../ingestion/net";

type LookupAddress = { address: string; family: number };
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;
type LookupOptions = { all?: boolean; family?: number } & Record<string, unknown>;
type Resolver = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;

/**
 * Wrap a DNS resolver so it rejects any hostname that resolves to a private,
 * loopback, or link-local IP — checked on the ADDRESS, not the name. Injectable
 * resolver keeps it unit-testable offline. This is the piece that actually
 * closes DNS-rebinding: whatever address wins here is the one undici connects to.
 */
export function makeValidatingLookup(
  resolver: Resolver = dnsLookup as unknown as Resolver,
): Resolver {
  return (hostname, options, callback) => {
    resolver(hostname, options, (err, address, family) => {
      if (err) return callback(err, address, family);
      const ips = Array.isArray(address) ? address.map((a) => a.address) : [address];
      for (const ip of ips) {
        if (ipIsPrivate(ip)) {
          const blocked: NodeJS.ErrnoException = Object.assign(
            new Error(`blocked private address ${ip}`),
            { code: "ESSRFBLOCKED" },
          );
          return callback(blocked, address, family);
        }
      }
      callback(null, address, family);
    });
  };
}

export const validatingLookup = makeValidatingLookup();

let cached: Dispatcher | undefined;

/**
 * Lazily build + cache the undici dispatcher whose connection lookup validates
 * the RESOLVED IP at connect time — closing the DNS-rebinding TOCTOU a pre-fetch
 * string/DNS check can't (undici connects to exactly the address this lookup
 * approves), and guarding each redirect hop undici follows. `request-filtering-
 * agent` targets Node's `http.Agent`, which the global `fetch` (undici) ignores —
 * this is the undici-native equivalent.
 *
 * undici is `import()`-ed on first use, NOT at module load, so it never enters
 * the unit-test module graph (undici 8's eager index breaks under the test env,
 * and tests inject their own fetch anyway — this only runs for a real network call).
 */
export async function getSafeDispatcher(): Promise<Dispatcher> {
  if (!cached) {
    const { Agent } = await import("undici");
    cached = new Agent({
      connect: { lookup: validatingLookup as unknown as LookupFunction },
    });
  }
  return cached;
}
