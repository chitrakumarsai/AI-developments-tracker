import { describe, expect, it, vi } from "vitest";

import { rerankItems, MAX_VIEW_ITEMS, type RerankCandidate } from "./rerank";

const cand = (id: string): RerankCandidate => ({ id, title: id, summary: null });

describe("rerankItems", () => {
  it("returns the model's ordering, filtered to valid candidate ids", async () => {
    const complete = vi.fn(async () => '["b","a"]');
    const result = await rerankItems("interest", [cand("a"), cand("b")], complete);
    expect(result).toEqual(["b", "a"]);
  });

  it("drops ids the model invented (not in the candidate set)", async () => {
    const complete = vi.fn(async () => '["a","ghost","b"]');
    const result = await rerankItems("x", [cand("a"), cand("b")], complete);
    expect(result).toEqual(["a", "b"]);
  });

  it("de-duplicates repeated ids", async () => {
    const complete = vi.fn(async () => '["a","a","b"]');
    expect(await rerankItems("x", [cand("a"), cand("b")], complete)).toEqual(["a", "b"]);
  });

  it("tolerates a code fence / surrounding prose around the JSON", async () => {
    const complete = vi.fn(async () => 'Here you go:\n```json\n["b"]\n```');
    expect(await rerankItems("x", [cand("a"), cand("b")], complete)).toEqual(["b"]);
  });

  it("returns [] on unparseable output", async () => {
    const complete = vi.fn(async () => "no json here");
    expect(await rerankItems("x", [cand("a")], complete)).toEqual([]);
  });

  it("caps the result at MAX_VIEW_ITEMS", async () => {
    const many = Array.from({ length: 30 }, (_, i) => cand(`i${i}`));
    const complete = vi.fn(async () => JSON.stringify(many.map((c) => c.id)));
    const result = await rerankItems("x", many, complete);
    expect(result).toHaveLength(MAX_VIEW_ITEMS);
  });

  it("skips the LLM call entirely when there are no candidates", async () => {
    const complete = vi.fn();
    expect(await rerankItems("x", [], complete)).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});
