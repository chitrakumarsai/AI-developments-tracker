import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runDiscovery, type DiscoveryFetch } from "./discover";

type Src = { id: string; url: string };
type Item = { source_id: string; url: string; published_at?: string | null };

function makeClient(opts: {
  sources?: Src[];
  items?: Item[];
  sourceError?: string;
  itemError?: string;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "sources") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: opts.sources ?? [],
                error: opts.sourceError ? { message: opts.sourceError } : null,
              }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: opts.items ?? [],
                  error: opts.itemError ? { message: opts.itemError } : null,
                }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

type Page = {
  status?: number;
  html?: string;
  /** undefined ⇒ default text/html; null ⇒ header absent; "" ⇒ blank. */
  contentType?: string | null;
  location?: string;
  /** Emit a body of this many bytes (to exercise the streaming size cap). */
  bigBytes?: number;
};

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

function makeFetch(pages: Record<string, Page>): DiscoveryFetch {
  return async (url: string) => {
    const p = pages[url] ?? { status: 404 };
    const status = p.status ?? 200;
    const bytes = p.bigBytes
      ? new Uint8Array(p.bigBytes)
      : new TextEncoder().encode(p.html ?? "");
    return {
      ok: status >= 200 && status < 300,
      status,
      body: streamOf(bytes),
      headers: {
        get(name: string) {
          const k = name.toLowerCase();
          if (k === "content-type") return p.contentType === undefined ? "text/html" : p.contentType;
          if (k === "location") return p.location ?? null;
          return null;
        },
      },
      text: async () => p.html ?? "",
    };
  };
}

/** Default injected DNS guard for tests: everything resolves safe (offline). */
const safeResolve = async () => null;

describe("runDiscovery", () => {
  it("proposes hosts referenced by >= 2 distinct sources, drops single-source hosts", async () => {
    const client = makeClient({
      sources: [
        { id: "A", url: "https://sourcea.com/feed" },
        { id: "B", url: "https://sourceb.com/feed" },
      ],
      items: [
        { source_id: "A", url: "https://sourcea.com/post1" },
        { source_id: "B", url: "https://sourceb.com/post1" },
      ],
    });
    const fetchImpl = makeFetch({
      "https://sourcea.com/post1": {
        html: `<a href="https://shared.com/x">s</a><a href="https://onlya.com/y">o</a>`,
      },
      "https://sourceb.com/post1": { html: `<a href="https://shared.com/z">s</a>` },
    });
    const addCalls: unknown[] = [];
    const addCandidatesImpl = vi.fn(async (c: unknown[]) => {
      addCalls.push(c);
      return { added: c.length, skipped: 0 };
    });

    const summary = await runDiscovery({
      client,
      fetchImpl,
      addCandidatesImpl: addCandidatesImpl as never,
      resolveGuard: safeResolve,
    });

    expect(summary.hostsFound).toBe(1);
    expect(summary.proposed).toBe(1);
    expect(addCalls[0]).toEqual([
      {
        platform: "Discovered",
        handleOrUrl: "https://shared.com/",
        whySuggested: "Referenced by 2 of your sources",
      },
    ]);
  });

  it("excludes hosts that are already a live source", async () => {
    const client = makeClient({
      sources: [
        { id: "A", url: "https://sourcea.com/feed" },
        { id: "B", url: "https://shared.com/feed" }, // shared.com is already tracked
      ],
      items: [
        { source_id: "A", url: "https://sourcea.com/post1" },
        { source_id: "B", url: "https://shared.com/post1" },
      ],
    });
    const fetchImpl = makeFetch({
      "https://sourcea.com/post1": { html: `<a href="https://shared.com/x">s</a>` },
      "https://shared.com/post1": { html: `<a href="https://sourcea.com/y">s</a>` },
    });
    const addCandidatesImpl = vi.fn(async () => ({ added: 0, skipped: 0 }));

    const summary = await runDiscovery({
      client,
      fetchImpl,
      addCandidatesImpl: addCandidatesImpl as never,
      resolveGuard: safeResolve,
    });

    expect(summary.hostsFound).toBe(0);
    expect(addCandidatesImpl).not.toHaveBeenCalled();
  });

  it("records a warning and continues when a page fetch fails", async () => {
    const client = makeClient({
      sources: [
        { id: "A", url: "https://sourcea.com/feed" },
        { id: "B", url: "https://sourceb.com/feed" },
      ],
      items: [
        { source_id: "A", url: "https://sourcea.com/post1" }, // 500s
        { source_id: "B", url: "https://sourceb.com/post1" },
      ],
    });
    const fetchImpl = makeFetch({
      "https://sourcea.com/post1": { status: 500 },
      "https://sourceb.com/post1": { html: `<a href="https://shared.com/z">s</a>` },
    });
    const addCandidatesImpl = vi.fn(async () => ({ added: 0, skipped: 0 }));

    const summary = await runDiscovery({
      client,
      fetchImpl,
      addCandidatesImpl: addCandidatesImpl as never,
      resolveGuard: safeResolve,
    });

    expect(summary.fetched).toBe(1);
    expect(summary.warnings.some((w) => w.includes("HTTP 500"))).toBe(true);
  });

  it("skips an unsafe item url without fetching it", async () => {
    const client = makeClient({
      sources: [{ id: "A", url: "https://sourcea.com/feed" }],
      items: [{ source_id: "A", url: "http://127.0.0.1/admin" }],
    });
    const fetchImpl = vi.fn() as unknown as DiscoveryFetch;
    const summary = await runDiscovery({
      client,
      fetchImpl,
      addCandidatesImpl: (async () => ({ added: 0, skipped: 0 })) as never,
      resolveGuard: safeResolve,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.warnings.some((w) => w.includes("unsafe"))).toBe(true);
  });

  it("returns zeros and does not fetch when there are no active sources", async () => {
    const client = makeClient({ sources: [] });
    const fetchImpl = vi.fn() as unknown as DiscoveryFetch;
    const summary = await runDiscovery({ client, fetchImpl, resolveGuard: safeResolve });
    expect(summary).toMatchObject({ scannedSources: 0, fetched: 0, proposed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the sources query fails", async () => {
    const client = makeClient({ sourceError: "src boom" });
    await expect(runDiscovery({ client })).rejects.toThrow(/src boom/);
  });

  it("skips a page whose host resolves to a private IP (DNS-rebinding guard)", async () => {
    const client = makeClient({
      sources: [{ id: "A", url: "https://sourcea.com/feed" }],
      items: [{ source_id: "A", url: "https://rebind.example/post" }],
    });
    const fetchImpl = vi.fn() as unknown as DiscoveryFetch;
    const summary = await runDiscovery({
      client,
      fetchImpl,
      resolveGuard: async () => "resolves to private IP 169.254.169.254",
      addCandidatesImpl: (async () => ({ added: 0, skipped: 0 })) as never,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.warnings.some((w) => w.includes("private IP"))).toBe(true);
  });

  it("caps an oversized response via the stream, not res.text() (DoS guard)", async () => {
    const client = makeClient({
      sources: [{ id: "A", url: "https://sourcea.com/feed" }],
      items: [{ source_id: "A", url: "https://sourcea.com/huge" }],
    });
    const fetchImpl = makeFetch({
      "https://sourcea.com/huge": { bigBytes: 2_000_001 }, // one byte over the cap
    });
    const summary = await runDiscovery({
      client,
      fetchImpl,
      resolveGuard: safeResolve,
      addCandidatesImpl: (async () => ({ added: 0, skipped: 0 })) as never,
    });
    expect(summary.fetched).toBe(0);
    expect(summary.warnings.some((w) => w.includes("size cap"))).toBe(true);
  });

  it("rejects a response with no content-type (fails closed)", async () => {
    const client = makeClient({
      sources: [{ id: "A", url: "https://sourcea.com/feed" }],
      items: [{ source_id: "A", url: "https://sourcea.com/blob" }],
    });
    const fetchImpl = makeFetch({
      "https://sourcea.com/blob": { contentType: null, html: "<a href='https://x.com'>x</a>" },
    });
    const summary = await runDiscovery({
      client,
      fetchImpl,
      resolveGuard: safeResolve,
      addCandidatesImpl: (async () => ({ added: 0, skipped: 0 })) as never,
    });
    expect(summary.fetched).toBe(0);
    expect(summary.warnings.some((w) => w.includes("missing content-type"))).toBe(true);
  });
});
