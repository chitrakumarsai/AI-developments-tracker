import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { arxivConnector, buildArxivQueryUrl } from "./arxiv";
import type { SourceRef } from "../types";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./__fixtures__/arxiv-api.xml", import.meta.url)),
  "utf-8",
);

const source: SourceRef = {
  id: "arxiv-ai",
  name: "arXiv — cs.AI",
  category: "Research Papers",
  url: "https://export.arxiv.org/api/query?search_query=cat:cs.AI",
  tags: ["ai", "papers"],
};

describe("buildArxivQueryUrl", () => {
  it("keeps the source's search_query and adds a bounded, recency-sorted query", () => {
    const built = new URL(buildArxivQueryUrl(source.url));
    expect(built.searchParams.get("search_query")).toBe("cat:cs.AI");
    expect(built.searchParams.get("sortBy")).toBe("submittedDate");
    expect(built.searchParams.get("sortOrder")).toBe("descending");
    // Hard per-category cap so a busy category can't flood the feed (GATE 1).
    expect(built.searchParams.get("max_results")).toBe("50");
    expect(built.searchParams.get("start")).toBe("0");
  });
});

describe("arxivConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the bounded query and parses the Atom feed (metric stays null)", async () => {
    const fetchSpy = vi.fn(async () => new Response(FIXTURE, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await arxivConnector(source);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Scaling Agentic Reasoning with Verifier-Guided Search");
    expect(result.items[0].url).toBe("http://arxiv.org/abs/2507.00001v1");
    expect(result.items[0].category).toBe("Research Papers");
    expect(result.items[0].tags).toEqual(["ai", "papers"]);
    // Recency-only source: no popularity signal (per preference).
    expect(result.items[0].metric).toBeUndefined();

    const calls = fetchSpy.mock.calls as unknown as Array<[string, unknown]>;
    expect(calls[0][0]).toMatch(/sortBy=submittedDate/);
    expect(calls[0][0]).toMatch(/max_results=50/);
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 503 })));
    const result = await arxivConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /HTTP 503/.test(w))).toBe(true);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await arxivConnector(source);
    expect(result.warnings.some((w) => /network down/.test(w))).toBe(true);
  });

  it("refuses an unsafe (non-http/private) source URL without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await arxivConnector({ ...source, url: "http://127.0.0.1/api/query" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /refusing to fetch/i.test(w))).toBe(true);
  });

  it("warns (no throw) on a malformed source URL that can't be parsed", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await arxivConnector({ ...source, url: "not a url" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /invalid source url/i.test(w))).toBe(true);
  });
});
