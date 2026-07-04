import { describe, expect, it } from "vitest";

import { normalizeFilters, viewToHref } from "./href";

describe("normalizeFilters", () => {
  it("keeps known, valid keys", () => {
    expect(
      normalizeFilters({
        section: "repos",
        sort: "recent",
        window: "week",
        source: "src-1",
        tag: "agents",
        q: "rag",
        state: "unread",
      }),
    ).toEqual({
      section: "repos",
      sort: "recent",
      window: "week",
      source: "src-1",
      tag: "agents",
      q: "rag",
      state: "unread",
    });
  });

  it("drops unknown keys and invalid enum values", () => {
    const result = normalizeFilters({
      section: "repos",
      sort: "sideways", // invalid
      window: "decade", // invalid
      state: "starred", // invalid
      evil: "haxx", // unknown
    });
    expect(result).toEqual({
      section: "repos",
      sort: undefined,
      window: undefined,
      source: undefined,
      tag: undefined,
      q: undefined,
      state: undefined,
    });
  });

  it("returns all-undefined for non-object input", () => {
    expect(normalizeFilters(null).section).toBeUndefined();
    expect(normalizeFilters("nope").sort).toBeUndefined();
    expect(normalizeFilters(42).tag).toBeUndefined();
  });

  it("trims and length-caps free-text fields", () => {
    const r = normalizeFilters({ tag: "  x".padEnd(200, "y"), q: "  hi  " });
    expect(r.q).toBe("hi");
    expect(r.tag?.length).toBe(64);
  });
});

describe("viewToHref", () => {
  it("builds the feed URL for a saved view", () => {
    expect(viewToHref({ section: "repos", window: "week", tag: "agents" })).toBe(
      "/?section=repos&window=week&tag=agents",
    );
  });

  it("ignores junk and produces a safe URL", () => {
    expect(viewToHref({ evil: "javascript:alert(1)", sort: "bogus" })).toBe("/");
  });

  it("returns / for an empty view", () => {
    expect(viewToHref({})).toBe("/");
    expect(viewToHref(null)).toBe("/");
  });
});
