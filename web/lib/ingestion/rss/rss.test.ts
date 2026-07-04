import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rssConnector, parseRssFeed, readAuthor, repairEntities } from "./rss";
import type { SourceRef } from "../types";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf-8",
  );
}

const ARXIV_FIXTURE = fixture("arxiv-cs-lg.xml");
const BLOG_FIXTURE = fixture("blog-sample.xml");

describe("repairEntities", () => {
  it("escapes a bare ampersand that isn't a valid entity", () => {
    expect(repairEntities("R&D at Apple")).toBe("R&amp;D at Apple");
  });

  it("leaves valid named and numeric entities untouched", () => {
    expect(repairEntities("Tom &amp; Jerry &#233; &#x2014; &lt;3")).toBe(
      "Tom &amp; Jerry &#233; &#x2014; &lt;3",
    );
  });

  it("lets a feed with a bare ampersand parse instead of throwing", async () => {
    const xml =
      '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>' +
      "<item><title>Research & Development</title><link>https://example.com/a</link></item>" +
      "</channel></rss>";
    const result = await parseRssFeed(xml, {
      id: "s",
      name: "Bare-amp feed",
      category: "Companies & Labs",
      url: "https://example.com/feed",
      tags: ["blog"],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Research & Development");
  });
});

describe("readAuthor", () => {
  it("passes through a plain string (dc:creator)", () => {
    expect(readAuthor("Jane Doe")).toBe("Jane Doe");
  });

  it("extracts name from an Atom <author> object (string or array)", () => {
    expect(readAuthor({ name: ["Keyword Team"] })).toBe("Keyword Team");
    expect(readAuthor({ name: "Solo Author" })).toBe("Solo Author");
  });

  it("returns '' for unusable shapes instead of crashing", () => {
    expect(readAuthor(undefined)).toBe("");
    expect(readAuthor({ foo: "bar" })).toBe("");
    expect(readAuthor(42)).toBe("");
  });
});

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
