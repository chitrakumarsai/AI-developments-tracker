import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildSnapshot } from "./search";

/** Client whose `rpc("match_items", …)` resolves the given candidate rows. */
function makeClient(
  rows: Array<{ id: string; title: string | null; summary: string | null }>,
  error?: string,
) {
  const rpc = vi.fn(() =>
    Promise.resolve(error ? { data: null, error: { message: error } } : { data: rows, error: null }),
  );
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("buildSnapshot", () => {
  it("embeds the prompt, retrieves candidates, and reranks into a ranked snapshot", async () => {
    const embed = vi.fn(async () => [[0.1, 0.2]]);
    const complete = vi.fn(async () => '["b","a"]');
    const { client, rpc } = makeClient([
      { id: "a", title: "A", summary: null },
      { id: "b", title: "B", summary: null },
    ]);

    const snapshot = await buildSnapshot("efficient inference", { embed, complete, client });

    expect(snapshot.embedding).toEqual([0.1, 0.2]);
    expect(snapshot.items).toEqual([
      { id: "b", rank: 0, score: null },
      { id: "a", rank: 1, score: null },
    ]);
    // pgvector query is passed as its text form.
    expect(rpc).toHaveBeenCalledWith("match_items", {
      query_embedding: "[0.1,0.2]",
      match_count: 60,
    });
  });

  it("throws when embedding yields nothing", async () => {
    const embed = vi.fn(async () => []);
    const { client } = makeClient([]);
    await expect(
      buildSnapshot("x", { embed, complete: vi.fn(), client }),
    ).rejects.toThrow(/Failed to embed/);
  });

  it("throws when the retrieval RPC errors", async () => {
    const embed = vi.fn(async () => [[0.1]]);
    const { client } = makeClient([], "rpc boom");
    await expect(
      buildSnapshot("x", { embed, complete: vi.fn(), client }),
    ).rejects.toThrow(/Retrieval failed: rpc boom/);
  });

  it("yields an empty snapshot when nothing is retrieved", async () => {
    const embed = vi.fn(async () => [[0.1]]);
    const complete = vi.fn();
    const { client } = makeClient([]);
    const snapshot = await buildSnapshot("x", { embed, complete, client });
    expect(snapshot.items).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});
