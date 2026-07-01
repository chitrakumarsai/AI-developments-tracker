import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { arxivConnector, parseArxivFeed } from "./arxiv";
import type { SourceRef } from "../types";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./__fixtures__/arxiv-cs-lg.xml", import.meta.url)),
  "utf-8",
);

const source: SourceRef = {
  id: "src-1",
  name: "arXiv — cs.LG",
  category: "Research Papers",
  url: "http://export.arxiv.org/rss/cs.LG",
  tags: ["ai", "papers"],
};

describe("parseArxivFeed", () => {
  it("maps valid entries to normalized items", async () => {
    const result = await parseArxivFeed(FIXTURE, source);

    expect(result.sourceId).toBe("src-1");
    expect(result.items).toHaveLength(2); // third entry has no link
    const [first] = result.items;
    expect(first.title).toBe("Scaling Laws for Neural Language Models. (arXiv:2001.08361)");
    expect(first.url).toBe("http://arxiv.org/abs/2001.08361");
    expect(first.author).toBe("Jared Kaplan, Sam McCandlish");
    expect(first.publishedAt).toBe("2020-01-22T00:00:00.000Z");
  });

  it("inherits the source category and tags", async () => {
    const result = await parseArxivFeed(FIXTURE, source);
    for (const item of result.items) {
      expect(item.category).toBe("Research Papers");
      expect(item.tags).toEqual(["ai", "papers"]);
    }
  });

  it("sanitizes the abstract: strips tags and decodes entities", async () => {
    const result = await parseArxivFeed(FIXTURE, source);
    const [first] = result.items;
    expect(first.summary).not.toContain("<");
    expect(first.summary).toContain("cross-entropy loss & show they hold over >7");
  });

  it("warns about and skips entries missing a link", async () => {
    const result = await parseArxivFeed(FIXTURE, source);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/missing title\/link/i);
  });
});

describe("arxivConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and parses a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FIXTURE, { status: 200 })),
    );
    const result = await arxivConnector(source);
    expect(result.items).toHaveLength(2);
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    const result = await arxivConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/HTTP 503/);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await arxivConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/network down/);
  });

  it("refuses to fetch a private/loopback host (SSRF guard) without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await arxivConnector({
      ...source,
      url: "http://169.254.169.254/latest/meta-data/",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/private\/loopback/i);
  });

  it("refuses a non-http scheme without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await arxivConnector({ ...source, url: "file:///etc/passwd" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings[0]).toMatch(/disallowed scheme/i);
  });
});
