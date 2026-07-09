import "server-only";

import { promises as dns } from "node:dns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import { addCandidates, type NewCandidate } from "../candidates/persist";
import { unsafeUrlReason, ipIsPrivate, USER_AGENT, FETCH_TIMEOUT_MS } from "../ingestion/net";
import { extractOutboundHosts, normalizeHost } from "./extract";

/** Outcome of one discovery run, surfaced to the owner. */
export type DiscoverySummary = {
  scannedSources: number;
  fetched: number;
  /** Distinct untracked hosts that met the source-spread threshold. */
  hostsFound: number;
  /** New candidates actually inserted (after addCandidates dedupe). */
  proposed: number;
  /** Proposed hosts already known (queued or a live source). */
  skipped: number;
  warnings: string[];
};

// Bounds against a slow/hostile external surface (§12.7). Kept conservative so a
// manual run finishes well within the function timeout.
const MAX_ITEMS_PER_SOURCE = 5;
const MAX_TOTAL_FETCHES = 40;
const MIN_SOURCE_SPREAD = 2; // a host must be referenced by ≥2 distinct sources
const TOP_K = 20;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type FetchResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  /** Streamed so the byte cap is enforced incrementally (never buffer first). */
  body?: ReadableStream<Uint8Array> | null;
  text: () => Promise<string>;
};
export type DiscoveryFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: "manual" },
) => Promise<FetchResponse>;

/** Returns a reason if a URL's host resolves to an unsafe IP, else null. */
export type ResolveGuard = (url: string) => Promise<string | null>;

export type DiscoveryDeps = {
  client?: SupabaseClient;
  fetchImpl?: DiscoveryFetch;
  /** Injected for tests; defaults to the real dedupe+insert. */
  addCandidatesImpl?: typeof addCandidates;
  /** Injected for tests (keeps them offline); defaults to a real DNS check. */
  resolveGuard?: ResolveGuard;
};

/**
 * Resolve a URL's host and reject if ANY resolved address is private/loopback/
 * link-local — defense against DNS-rebinding, which `unsafeUrlReason` (a string
 * check) cannot catch. Residual TOCTOU remains (the runtime re-resolves at
 * connect time); the complete fix is a connection-pinning agent
 * (`request-filtering-agent`) — see the 2.4.3 plan's security note.
 */
async function realResolveGuard(url: string): Promise<string | null> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "invalid URL";
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const { address } of addrs) {
      if (ipIsPrivate(address)) return `resolves to private IP ${address}`;
    }
  } catch {
    return "DNS resolution failed";
  }
  return null;
}

/**
 * Fetch an item page as HTML, following redirects MANUALLY so the SSRF guard
 * re-runs on every hop (a stored item URL is untrusted). Skips non-HTML and
 * over-sized responses. Never throws — returns `{ html }` or a `{ warning }`.
 */
async function readCappedHtml(
  res: FetchResponse,
  url: string,
): Promise<{ html: string } | { warning: string }> {
  const reader = res.body?.getReader?.();
  // Fallback only when there's no stream (should not happen for a real 200 body).
  if (!reader) {
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) return { warning: `${url}: response too large` };
    return { html: text };
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* best-effort */
      }
      return { warning: `${url}: response exceeded size cap` };
    }
    chunks.push(value);
  }
  return { html: Buffer.concat(chunks).toString("utf-8") };
}

async function safeFetchHtml(
  url: string,
  fetchImpl: DiscoveryFetch,
  resolveGuard: ResolveGuard,
): Promise<{ html: string } | { warning: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // String guard, then DNS guard — both BEFORE the request, on every hop.
      const unsafe = unsafeUrlReason(current);
      if (unsafe) return { warning: `${url}: ${unsafe}` };
      const resolvedUnsafe = await resolveGuard(current);
      if (resolvedUnsafe) return { warning: `${url}: ${resolvedUnsafe}` };

      const res = await fetchImpl(current, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT },
        redirect: "manual",
      });

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (!location) return { warning: `${url}: redirect without location` };
        try {
          current = new URL(location, current).href;
        } catch {
          return { warning: `${url}: bad redirect location` };
        }
        continue;
      }

      if (!res.ok) return { warning: `${url}: HTTP ${res.status}` };

      // Fail CLOSED: a missing/blank content-type is rejected, not accepted.
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) {
        return { warning: `${url}: not HTML (${type || "missing content-type"})` };
      }

      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > MAX_RESPONSE_BYTES) return { warning: `${url}: response too large` };

      return readCappedHtml(res, url);
    }
    return { warning: `${url}: too many redirects` };
  } catch {
    return { warning: `${url}: fetch failed` };
  } finally {
    clearTimeout(timer);
  }
}

/** Pick up to MAX_ITEMS_PER_SOURCE recent items per source, capped overall. */
function selectItems(
  items: Array<{ source_id: string; url: string }>,
): Array<{ source_id: string; url: string }> {
  const perSource = new Map<string, number>();
  const chosen: Array<{ source_id: string; url: string }> = [];
  for (const item of items) {
    if (chosen.length >= MAX_TOTAL_FETCHES) break;
    const seen = perSource.get(item.source_id) ?? 0;
    if (seen >= MAX_ITEMS_PER_SOURCE) continue;
    perSource.set(item.source_id, seen + 1);
    chosen.push(item);
  }
  return chosen;
}

/**
 * Automated source discovery (2.4.3): scan recent items from the ACTIVE catalog,
 * tally which external hosts are referenced across ≥MIN_SOURCE_SPREAD distinct
 * sources, and propose the top untracked ones as `suggested` candidates through
 * the existing rating gate (`addCandidates` dedupes vs. the queue + live sources).
 * Discovery only *proposes* — nothing goes live without the owner's rating.
 * Every external page is fetched under the SSRF guard + fetch/size/count caps.
 */
export async function runDiscovery(deps: DiscoveryDeps = {}): Promise<DiscoverySummary> {
  const client = deps.client ?? getServerClient();
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as DiscoveryFetch);
  const addCandidatesImpl = deps.addCandidatesImpl ?? addCandidates;
  const resolveGuard = deps.resolveGuard ?? realResolveGuard;
  const warnings: string[] = [];

  const { data: sourceData, error: sourceError } = await client
    .from("sources")
    .select("id, url")
    .eq("status", "active");
  if (sourceError) throw new Error(`Failed to load sources: ${sourceError.message}`);

  const sources = (sourceData ?? []) as Array<{ id: string; url: string }>;
  const tracked = new Set<string>();
  for (const s of sources) {
    try {
      tracked.add(normalizeHost(new URL(s.url).hostname));
    } catch {
      /* a malformed source url just can't be excluded by host */
    }
  }
  if (sources.length === 0) {
    return { scannedSources: 0, fetched: 0, hostsFound: 0, proposed: 0, skipped: 0, warnings };
  }

  const { data: itemData, error: itemError } = await client
    .from("items")
    .select("source_id, url, published_at")
    .in(
      "source_id",
      sources.map((s) => s.id),
    )
    .order("published_at", { ascending: false })
    .limit(MAX_ITEMS_PER_SOURCE * Math.max(sources.length, 1) * 2);
  if (itemError) throw new Error(`Failed to load items: ${itemError.message}`);

  const selected = selectItems((itemData ?? []) as Array<{ source_id: string; url: string }>);

  // host → set of distinct source ids that referenced it
  const hostSpread = new Map<string, Set<string>>();
  let fetched = 0;
  for (const item of selected) {
    if (unsafeUrlReason(item.url)) {
      warnings.push(`${item.url}: unsafe, skipped`);
      continue;
    }
    const result = await safeFetchHtml(item.url, fetchImpl, resolveGuard);
    if ("warning" in result) {
      warnings.push(result.warning);
      continue;
    }
    fetched += 1;
    for (const host of extractOutboundHosts(result.html, item.url)) {
      if (tracked.has(host)) continue; // already a live source
      const set = hostSpread.get(host) ?? new Set<string>();
      set.add(item.source_id);
      hostSpread.set(host, set);
    }
  }

  const ranked = [...hostSpread.entries()]
    .map(([host, sourceIds]) => ({ host, spread: sourceIds.size }))
    .filter((h) => h.spread >= MIN_SOURCE_SPREAD)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, TOP_K);

  const candidates: NewCandidate[] = ranked.map(({ host, spread }) => ({
    platform: "Discovered",
    handleOrUrl: `https://${host}/`,
    whySuggested: `Referenced by ${spread} of your sources`,
  }));

  const { added, skipped } =
    candidates.length > 0
      ? await addCandidatesImpl(candidates, client)
      : { added: 0, skipped: 0 };

  return {
    scannedSources: sources.length,
    fetched,
    hostsFound: ranked.length,
    proposed: added,
    skipped,
    warnings,
  };
}
