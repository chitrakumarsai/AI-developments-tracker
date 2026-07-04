import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildHnSearchUrl, hackernewsConnector, parseHnSearch } from "./hackernews";
import type { SourceRef } from "../types";

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/hn-search.json", import.meta.url)), "utf-8"),
);

const source: SourceRef = {
  id: "hn-ai",
  name: "Hacker News — AI stories",
  category: "Social / Discussion",
  url: "https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=50",
  tags: ["hackernews", "discussion"],
};

describe("parseHnSearch", () => {
  it("maps stories, falls back to the HN item link for text posts, skips missing title/url", () => {
    const result = parseHnSearch(FIXTURE, source);
    // 2 valid (external-url story + text post via fallback); 2 skipped (no title, no id+url).
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://example.com/gpt5-analysis");
    expect(result.items[1].url).toBe("https://news.ycombinator.com/item?id=40000002");
    expect(result.warnings).toHaveLength(2);
  });

  it("sanitizes the title (decodes entities) and inherits category and tags", () => {
    const result = parseHnSearch(FIXTURE, source);
    expect(result.items[0].title).toBe("GPT-5 shows emergent tool use & planning");
    expect(result.items[0].category).toBe("Social / Discussion");
    expect(result.items[0].tags).toEqual(["hackernews", "discussion"]);
  });

  it("summarizes with points and comments, carries author and date", () => {
    const result = parseHnSearch(FIXTURE, source);
    expect(result.items[0].summary).toMatch(/543 points/);
    expect(result.items[0].summary).toMatch(/210 comments/);
    expect(result.items[0].author).toBe("researcher");
    expect(result.items[0].publishedAt).toBe("2026-06-28T12:00:00.000Z");
  });

  it("stores points as the popularity metric so ranking can normalize it", () => {
    const result = parseHnSearch(FIXTURE, source);
    expect(result.items[0].metric).toBe(543);
    expect(result.items[1].metric).toBe(168);
  });

  it("drops below-threshold (low-score) stories without warning", () => {
    // HN's Algolia index can't filter on points, so the high-score gate lives
    // here. Low-score hits are intentional exclusions, not data errors.
    const lowScore = {
      hits: [
        { objectID: "1", title: "Popular AI story", url: "https://example.com/a", points: 250 },
        { objectID: "2", title: "Niche low-score post", url: "https://example.com/b", points: 12 },
        { objectID: "3", title: "No points field", url: "https://example.com/c" },
      ],
    };
    const result = parseHnSearch(lowScore, source);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com/a");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("buildHnSearchUrl", () => {
  it("injects a rolling 30-day created_at_i lower bound via numericFilters", () => {
    const now = Date.parse("2026-07-03T00:00:00.000Z");
    const built = new URL(buildHnSearchUrl(source.url, now));
    const filter = built.searchParams.get("numericFilters");
    expect(filter).not.toBeNull();
    const match = /^created_at_i>(\d+)$/.exec(filter ?? "");
    expect(match).not.toBeNull();
    const since = Number(match?.[1]);
    // 30 days before `now`, in whole seconds.
    expect(since).toBe(Math.floor((now - 30 * 86_400_000) / 1000));
  });

  it("preserves the source's existing query params (query, tags)", () => {
    const built = new URL(buildHnSearchUrl(source.url));
    expect(built.searchParams.get("query")).toBe("AI");
    expect(built.searchParams.get("tags")).toBe("story");
  });
});

describe("hackernewsConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches (no auth header — keyless), applies the window, and parses stories", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await hackernewsConnector(source);
    expect(result.items).toHaveLength(2);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
    expect(calls[0][0]).toMatch(/numericFilters=created_at_i/);
    expect(calls[0][1].headers.authorization).toBeUndefined();
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 503 })));
    const result = await hackernewsConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /HTTP 503/.test(w))).toBe(true);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await hackernewsConnector(source);
    expect(result.warnings.some((w) => /network down/.test(w))).toBe(true);
  });

  it("refuses an unsafe (non-http/private) source URL without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await hackernewsConnector({ ...source, url: "http://127.0.0.1/api/v1/search" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /refusing to fetch/i.test(w))).toBe(true);
  });

  it("warns (no throw) on a malformed source URL that can't be parsed", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await hackernewsConnector({ ...source, url: "not a url" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /invalid source url/i.test(w))).toBe(true);
  });
});
