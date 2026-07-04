import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getFeedItems, sanitizeSearch } from "./queries";
import type { ItemRow } from "../supabase/types";

/** Build an ItemRow with sensible defaults; override only what a test cares about. */
function item(partial: Partial<ItemRow>): ItemRow {
  return {
    id: "id",
    source_id: "src",
    title: "Item",
    author: null,
    summary: null,
    url: "https://example.com/x",
    category: "Research Papers",
    tags: [],
    relevance_score: 0,
    read_state: false,
    published_at: "2026-07-01T00:00:00Z",
    fetched_at: "2026-07-01T00:00:00Z",
    metric: null,
    forks: null,
    feedback_value: null,
    ...partial,
  };
}

/**
 * Fake Supabase query builder that actually applies the recorded filters, so a
 * test can assert getFeedItems returns the right subset. Mirrors the subset of
 * the PostgREST chain that `getFeedItems` uses.
 */
function makeClient(rows: ItemRow[]): SupabaseClient {
  let data = rows;
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: string) {
      data = data.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
      return builder;
    },
    gte(col: string, val: string) {
      data = data.filter((r) => {
        const v = (r as unknown as Record<string, unknown>)[col];
        return typeof v === "string" && v >= val;
      });
      return builder;
    },
    contains(col: string, arr: string[]) {
      data = data.filter((r) => {
        const v = (r as unknown as Record<string, unknown>)[col];
        return Array.isArray(v) && arr.every((t) => (v as string[]).includes(t));
      });
      return builder;
    },
    or(expr: string) {
      // Keep rows where ANY comma-separated branch matches. Supports the three
      // operator forms getFeedItems emits: `col.ilike.*needle*`, `col.is.null`,
      // and `col.eq.value`.
      const branches = expr.split(",").map((clause) => {
        const [col, op, ...rest] = clause.split(".");
        return { col, op, arg: rest.join(".") };
      });
      data = data.filter((r) =>
        branches.some(({ col, op, arg }) => {
          const v = (r as unknown as Record<string, unknown>)[col];
          if (op === "ilike") {
            const needle = arg.replace(/\*/g, "").toLowerCase();
            return typeof v === "string" && v.toLowerCase().includes(needle);
          }
          if (op === "is") return arg === "null" ? v == null : false;
          if (op === "eq") return v === arg;
          return false;
        }),
      );
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return Promise.resolve({ data, error: null });
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

// `recent` sort keeps ordering trivial so tests assert on the filtered SET,
// independent of relevance-ranking internals.
const RECENT = { sort: "recent" as const, window: "all" as const };

describe("getFeedItems filtering", () => {
  it("restricts to one source when `source` is given", async () => {
    const client = makeClient([
      item({ id: "a", source_id: "reddit" }),
      item({ id: "b", source_id: "github" }),
    ]);

    const result = await getFeedItems({ ...RECENT, source: "reddit" }, client);

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("restricts to items carrying a tag when `tag` is given", async () => {
    const client = makeClient([
      item({ id: "a", tags: ["agents", "rag"] }),
      item({ id: "b", tags: ["vision"] }),
      item({ id: "c", tags: [] }),
    ]);

    const result = await getFeedItems({ ...RECENT, tag: "agents" }, client);

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("combines source and tag filters (both must match)", async () => {
    const client = makeClient([
      item({ id: "a", source_id: "reddit", tags: ["agents"] }),
      item({ id: "b", source_id: "reddit", tags: ["vision"] }),
      item({ id: "c", source_id: "github", tags: ["agents"] }),
    ]);

    const result = await getFeedItems(
      { ...RECENT, source: "reddit", tag: "agents" },
      client,
    );

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("returns everything when no source/tag filter is set", async () => {
    const client = makeClient([
      item({ id: "a", source_id: "reddit" }),
      item({ id: "b", source_id: "github" }),
    ]);

    const result = await getFeedItems({ ...RECENT }, client);

    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("restricts to items matching `q` in title or summary", async () => {
    const client = makeClient([
      item({ id: "a", title: "Diffusion models survey", summary: null }),
      item({ id: "b", title: "Unrelated", summary: "a note on diffusion sampling" }),
      item({ id: "c", title: "Reinforcement learning", summary: "policy gradients" }),
    ]);

    const result = await getFeedItems({ ...RECENT, q: "diffusion" }, client);

    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("treats search as case-insensitive and combines with source", async () => {
    const client = makeClient([
      item({ id: "a", source_id: "arxiv", title: "Vision Transformers" }),
      item({ id: "b", source_id: "reddit", title: "vision transformers thread" }),
    ]);

    const result = await getFeedItems(
      { ...RECENT, q: "VISION", source: "arxiv" },
      client,
    );

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("ignores a search that sanitizes to empty", async () => {
    const client = makeClient([
      item({ id: "a", title: "one" }),
      item({ id: "b", title: "two" }),
    ]);

    const result = await getFeedItems({ ...RECENT, q: "()%_" }, client);

    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("restricts to unread items when state=unread", async () => {
    const client = makeClient([
      item({ id: "a", read_state: false }),
      item({ id: "b", read_state: true }),
    ]);

    const result = await getFeedItems({ ...RECENT, state: "unread" }, client);

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("restricts to thumbs-up items when state=liked", async () => {
    const client = makeClient([
      item({ id: "a", feedback_value: "up" }),
      item({ id: "b", feedback_value: "down" }),
      item({ id: "c", feedback_value: null }),
    ]);

    const result = await getFeedItems({ ...RECENT, state: "liked" }, client);

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("drops only thumbs-down items when state=hide-down (keeps null + up)", async () => {
    const client = makeClient([
      item({ id: "a", feedback_value: null }),
      item({ id: "b", feedback_value: "up" }),
      item({ id: "c", feedback_value: "down" }),
    ]);

    const result = await getFeedItems({ ...RECENT, state: "hide-down" }, client);

    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("surfaces a Supabase error as a thrown error", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(getFeedItems({ ...RECENT }, failing)).rejects.toThrow(/boom/);
  });
});

describe("sanitizeSearch", () => {
  it("strips or()/LIKE special characters", () => {
    expect(sanitizeSearch("a,b(c)*d%e_f\\g\"h")).toBe("a b c d e f g h");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeSearch("  vision   transformer  ")).toBe("vision transformer");
  });

  it("caps length at 100 characters", () => {
    expect(sanitizeSearch("x".repeat(200))).toHaveLength(100);
  });

  it("returns empty string when nothing searchable remains", () => {
    expect(sanitizeSearch("()%_,")).toBe("");
  });
});
