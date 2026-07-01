import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rssConnector, parseRssFeed } from "./rss";
import type { SourceRef } from "../types";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf-8",
  );
}

const ARXIV_FIXTURE = fixture("arxiv-cs-lg.xml");
const BLOG_FIXTURE = fixture("blog-sample.xml");

const arxivSource: SourceRef = {
  id: "src-1",
  name: "arXiv — cs.LG",
  category: "Research Papers",
  url: "http://export.arxiv.org/rss/cs.LG",
  tags: ["ai", "papers"],
};

const blogSource: SourceRef = {
  id: "src-2",
  name: "Example Lab — Blog",
  category: "Companies & Labs",
  url: "https://lab.example.com/blog/feed.xml",
  tags: ["lab", "blog"],
};

describe("parseRssFeed — arXiv (regression)", () => {
  it("maps valid entries and skips ones missing a link", async () => {
    const result = await parseRssFeed(ARXIV_FIXTURE, arxivSource);
    expect(result.items).toHaveLength(2); // third entry has no link
    expect(result.items[0].url).toBe("http://arxiv.org/abs/2001.08361");
    expect(result.items[0].category).toBe("Research Papers");
    expect(result.warnings).toHaveLength(1);
  });

  it("sanitizes the abstract: strips tags and decodes entities", async () => {
    const result = await parseRssFeed(ARXIV_FIXTURE, arxivSource);
    expect(result.items[0].summary).not.toContain("<");
    expect(result.items[0].summary).toContain("cross-entropy loss & show they hold over >7");
  });
});

describe("parseRssFeed — company blog", () => {
  it("maps blog entries and inherits the source category/tags", async () => {
    const result = await parseRssFeed(BLOG_FIXTURE, blogSource);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Introducing Our New Model");
    expect(result.items[0].url).toBe("https://lab.example.com/blog/new-model");
    for (const item of result.items) {
      expect(item.category).toBe("Companies & Labs");
      expect(item.tags).toEqual(["lab", "blog"]);
    }
  });

  it("keeps summaries link-first: no raw HTML from content:encoded", async () => {
    const result = await parseRssFeed(BLOG_FIXTURE, blogSource);
    for (const item of result.items) {
      expect(item.summary ?? "").not.toContain("<");
    }
  });
});

describe("rssConnector", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and parses a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(BLOG_FIXTURE, { status: 200 })));
    const result = await rssConnector(blogSource);
    expect(result.items).toHaveLength(2);
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const result = await rssConnector(blogSource);
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/HTTP 503/);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await rssConnector(blogSource);
    expect(result.warnings[0]).toMatch(/network down/);
  });

  it("refuses a private/loopback host (SSRF guard) without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await rssConnector({ ...blogSource, url: "http://169.254.169.254/latest/meta-data/" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings[0]).toMatch(/private\/loopback/i);
  });

  it("refuses a non-http scheme without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await rssConnector({ ...blogSource, url: "file:///etc/passwd" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings[0]).toMatch(/disallowed scheme/i);
  });
});
