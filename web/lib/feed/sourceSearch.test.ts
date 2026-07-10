import { describe, expect, it } from "vitest";

import { filterSources } from "./sourceSearch";

/** A slice of the real catalog — prefixed names are the norm (24 active sources). */
const SOURCES = [
  { id: "1", name: "arXiv — cs.AI" },
  { id: "2", name: "arXiv — cs.CL" },
  { id: "3", name: "arXiv — cs.LG" },
  { id: "4", name: "Hacker News — AI stories" },
  { id: "5", name: "Hugging Face — Daily Papers" },
  { id: "6", name: "Google DeepMind — Blog" },
  { id: "7", name: "Reddit — r/ArtificialInteligence" },
  { id: "8", name: "eugeneyan" },
] as const;

describe("filterSources", () => {
  it("returns every source for an empty or whitespace query", () => {
    expect(filterSources(SOURCES, "")).toHaveLength(SOURCES.length);
    expect(filterSources(SOURCES, "   ")).toHaveLength(SOURCES.length);
  });

  it("matches case-insensitively", () => {
    expect(filterSources(SOURCES, "ARXIV").map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(filterSources(SOURCES, "arxiv").map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  it("matches a substring anywhere in the name", () => {
    expect(filterSources(SOURCES, "deepmind").map((s) => s.id)).toEqual(["6"]);
    expect(filterSources(SOURCES, "papers").map((s) => s.id)).toEqual(["5"]);
  });

  it("treats the em-dash separator as a word break, so tokens span it", () => {
    // "arxiv cl" must find "arXiv — cs.CL" even though the words are split by "—".
    expect(filterSources(SOURCES, "arxiv cl").map((s) => s.id)).toEqual(["2"]);
    expect(filterSources(SOURCES, "hacker ai").map((s) => s.id)).toEqual(["4"]);
  });

  it("requires every token to match (AND, not OR)", () => {
    expect(filterSources(SOURCES, "arxiv deepmind")).toEqual([]);
  });

  it("ignores token order", () => {
    expect(filterSources(SOURCES, "cl arxiv").map((s) => s.id)).toEqual(["2"]);
  });

  it("returns no matches rather than throwing on a query with no hits", () => {
    expect(filterSources(SOURCES, "zzzz")).toEqual([]);
  });

  it("is not confused by regex metacharacters in the query", () => {
    // A hostile or careless query must be treated as literal text.
    expect(() => filterSources(SOURCES, "a(b[c.*")).not.toThrow();
    expect(filterSources(SOURCES, "a(b[c.*")).toEqual([]);
  });

  it("matches names that contain punctuation the query omits", () => {
    // "r/ArtificialInteligence" — user types "reddit artificial".
    expect(filterSources(SOURCES, "reddit artificial").map((s) => s.id)).toEqual(["7"]);
  });

  it("preserves the incoming order of the source list", () => {
    expect(filterSources(SOURCES, "a").map((s) => s.id)).toEqual(
      SOURCES.filter((s) => s.name.toLowerCase().includes("a")).map((s) => s.id),
    );
  });
});
