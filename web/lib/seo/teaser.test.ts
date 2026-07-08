import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getTeaserItems, TEASER_LIMIT } from "./teaser";
import type { ItemRow } from "../supabase/types";

/** A minimal item row — only the fields the teaser path reads/annotates. */
function row(n: number): ItemRow {
  return {
    id: `item-${n}`,
    source_id: "src-1",
    title: `Headline ${n}`,
    author: null,
    summary: null,
    url: `https://example.test/${n}`,
    category: "papers",
    tags: [],
    relevance_score: 0,
    read_state: false,
    published_at: new Date(Date.now() - n * 1000).toISOString(),
    fetched_at: new Date().toISOString(),
    metric: null,
    forks: null,
    feedback_value: null,
    source: { name: "arXiv" },
  };
}

/**
 * Thenable query builder: every chainable filter returns itself; `limit`
 * resolves `{ data, error }`. Mirrors the PostgREST surface `getFeedItems` uses
 * for the recency sort without needing a real database.
 */
function fakeClient(rows: ItemRow[]): SupabaseClient {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "contains", "or", "gte", "order"]) {
    builder[method] = () => builder;
  }
  builder.limit = () => Promise.resolve({ data: rows, error: null });
  return {
    from: () => ({ select: () => builder }),
  } as unknown as SupabaseClient;
}

describe("getTeaserItems", () => {
  it("caps the preview at TEASER_LIMIT when more rows exist", async () => {
    const rows = Array.from({ length: TEASER_LIMIT + 5 }, (_, i) => row(i));
    const items = await getTeaserItems(fakeClient(rows));
    expect(items).toHaveLength(TEASER_LIMIT);
  });

  it("returns all rows when fewer than the cap are available", async () => {
    const rows = [row(1), row(2)];
    const items = await getTeaserItems(fakeClient(rows));
    expect(items).toHaveLength(2);
  });

  it("leaves anonymous items unvoted/unread (no per-user state leaks)", async () => {
    const items = await getTeaserItems(fakeClient([row(1)]));
    expect(items[0].feedback_value).toBeNull();
    expect(items[0].read_state).toBe(false);
  });

  it("returns an empty list when the source has no items", async () => {
    const items = await getTeaserItems(fakeClient([]));
    expect(items).toEqual([]);
  });
});
