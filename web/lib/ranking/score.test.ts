import { describe, expect, it } from "vitest";

import {
  popularityScore,
  rankItems,
  rankScore,
  recencyScore,
  type RankableItem,
} from "./score";

const NOW = Date.parse("2026-07-02T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("recencyScore", () => {
  it("is 1 at now and decays to 0 at the window edge", () => {
    expect(recencyScore(daysAgo(0), NOW, 30)).toBeCloseTo(1, 5);
    expect(recencyScore(daysAgo(15), NOW, 30)).toBeCloseTo(0.5, 5);
    expect(recencyScore(daysAgo(30), NOW, 30)).toBeCloseTo(0, 5);
  });

  it("clamps beyond-window, undated, and invalid dates to 0", () => {
    expect(recencyScore(daysAgo(45), NOW, 30)).toBe(0);
    expect(recencyScore(null, NOW, 30)).toBe(0);
    expect(recencyScore("not-a-date", NOW, 30)).toBe(0);
  });

  it("treats future timestamps (clock skew) as fully recent", () => {
    expect(recencyScore(daysAgo(-2), NOW, 30)).toBe(1);
  });
});

describe("popularityScore", () => {
  it("is 1 at the source max and lower for smaller metrics", () => {
    expect(popularityScore(12000, 12000)).toBeCloseTo(1, 5);
    expect(popularityScore(100, 12000)).toBeLessThan(popularityScore(1000, 12000));
  });

  it("is 0 without a metric or a usable source max", () => {
    expect(popularityScore(null, 12000)).toBe(0);
    expect(popularityScore(0, 12000)).toBe(0);
    expect(popularityScore(500, 0)).toBe(0);
    expect(popularityScore(500, null)).toBe(0);
  });
});

describe("rankScore", () => {
  it("weights recency and popularity equally (50/50)", () => {
    expect(rankScore(1, 0)).toBeCloseTo(0.5, 5);
    expect(rankScore(0, 1)).toBeCloseTo(0.5, 5);
    expect(rankScore(1, 1)).toBeCloseTo(1, 5);
  });
});

describe("rankItems", () => {
  it("normalizes popularity per source so sources compete fairly", () => {
    // GitHub repo (max 12000 in its source) at 12000 → popularity 1.
    // Reddit post (max 400 in its source) at 400 → popularity 1 too.
    // Both equally old → equal score → stable (input) order preserved.
    const items: RankableItem[] = [
      { source_id: "gh", metric: 12000, published_at: daysAgo(10) },
      { source_id: "reddit", metric: 400, published_at: daysAgo(10) },
    ];
    const ranked = rankItems(items, NOW, 30);
    expect(ranked.map((i) => i.source_id)).toEqual(["gh", "reddit"]);
  });

  it("ranks a fresh popular item above a stale one and a stale above undated", () => {
    const fresh = { source_id: "gh", metric: 5000, published_at: daysAgo(1) };
    const stale = { source_id: "gh", metric: 5000, published_at: daysAgo(25) };
    const undated = { source_id: "gh", metric: 5000, published_at: null };
    const ranked = rankItems([stale, undated, fresh], NOW, 30);
    expect(ranked[0]).toBe(fresh);
    expect(ranked[2]).toBe(undated);
  });

  it("lets a fresh recency-only item outrank a quiet, older popular-source item", () => {
    // A busy repo sets gh's source max, so the quiet old repo's popularity is
    // small — a fresh arXiv paper (no metric, recency only) beats it.
    const repoPopular = { source_id: "gh", metric: 10000, published_at: daysAgo(28) };
    const repoOldQuiet = { source_id: "gh", metric: 10, published_at: daysAgo(25) };
    const paperNew = { source_id: "arxiv", metric: null, published_at: daysAgo(1) };
    const ranked = rankItems([repoPopular, repoOldQuiet, paperNew], NOW, 30);
    expect(ranked.indexOf(paperNew)).toBeLessThan(ranked.indexOf(repoOldQuiet));
  });

  it("does not mutate the input array", () => {
    const items: RankableItem[] = [
      { source_id: "a", metric: 1, published_at: daysAgo(5) },
      { source_id: "b", metric: 9, published_at: daysAgo(1) },
    ];
    const copy = [...items];
    rankItems(items, NOW, 30);
    expect(items).toEqual(copy);
  });
});
