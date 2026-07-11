import { describe, expect, it } from "vitest";

import {
  CATALOG_PAGE_SIZE,
  countByStatus,
  paginate,
  rowsForTab,
} from "./catalogView";
import type { SourceWithCount } from "./persist";
import type { SourceStatus } from "../supabase/types";

function src(
  id: string,
  status: SourceStatus,
  name = `Source ${id}`,
): SourceWithCount {
  return {
    id,
    name,
    category: "Newsletters & Blogs",
    url: `https://example.com/${id}`,
    ingestion_type: "rss",
    status,
    priority: 0,
    tags: [],
    notes: null,
    added_on: "2026-07-11T00:00:00Z",
    last_fetched: null,
    refresh_interval: "1 day",
    itemCount: 0,
  };
}

describe("countByStatus", () => {
  it("tallies each status and zero-fills the rest", () => {
    const counts = countByStatus([
      src("a", "active"),
      src("b", "active"),
      src("c", "paused"),
    ]);
    expect(counts).toEqual({ active: 2, paused: 1, archived: 0 });
  });

  it("ignores rows with an unknown status", () => {
    const rogue = { ...src("x", "active"), status: "weird" } as unknown as SourceWithCount;
    expect(countByStatus([rogue, src("a", "active")])).toEqual({
      active: 1,
      paused: 0,
      archived: 0,
    });
  });
});

describe("rowsForTab", () => {
  const all = [
    src("a", "active", "arXiv cs.AI"),
    src("z", "archived", "Old Blog"),
    src("b", "active", "Hugging Face Papers"),
    src("p", "paused", "Paused Feed"),
  ];

  it("returns only rows matching the tab status, order preserved", () => {
    expect(rowsForTab(all, "active", "").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("filters by case-insensitive name substring within the tab", () => {
    expect(rowsForTab(all, "active", "face").map((r) => r.id)).toEqual(["b"]);
    expect(rowsForTab(all, "active", "ARXIV").map((r) => r.id)).toEqual(["a"]);
  });

  it("treats a blank/whitespace search as no filter", () => {
    expect(rowsForTab(all, "archived", "   ").map((r) => r.id)).toEqual(["z"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...all];
    rowsForTab(all, "active", "face");
    expect(all).toEqual(copy);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    src(String(i), "active"),
  );

  it("caps rows at the page size and flags more remaining", () => {
    const page = paginate(rows, CATALOG_PAGE_SIZE);
    expect(page.rows).toHaveLength(CATALOG_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(25);
  });

  it("reveals more rows as visibleCount grows, ending hasMore=false", () => {
    const page = paginate(rows, 40);
    expect(page.rows).toHaveLength(25);
    expect(page.hasMore).toBe(false);
  });

  it("clamps a too-small visibleCount up to one page", () => {
    const page = paginate(rows, 0);
    expect(page.rows).toHaveLength(CATALOG_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
  });

  it("never reports hasMore when everything fits", () => {
    const few = rows.slice(0, 5);
    expect(paginate(few, CATALOG_PAGE_SIZE)).toEqual({
      rows: few,
      hasMore: false,
      total: 5,
    });
  });
});
