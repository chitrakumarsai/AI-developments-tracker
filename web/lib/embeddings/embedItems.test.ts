import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { embedItems } from "./embedItems";

/** Records `items.update({embedding}).eq("id", id)` calls; `failIds` error out. */
function makeClient(failIds: Set<string> = new Set()) {
  const updates: Array<{ id: string; embedding: string }> = [];
  const client = {
    from() {
      return {
        update(payload: { embedding: string }) {
          return {
            eq(_col: string, id: string) {
              updates.push({ id, embedding: payload.embedding });
              return Promise.resolve({ error: failIds.has(id) ? { message: "boom" } : null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

describe("embedItems", () => {
  it("embeds items with text and stores each vector as a pgvector string", async () => {
    const { client, updates } = makeClient();
    const embedFn = vi.fn(async (inputs: string[]) => inputs.map((_, i) => [i, i + 1]));
    const result = await embedItems(
      client,
      [
        { id: "a", title: "vLLM", summary: "serving" },
        { id: "b", title: "Mixtral" },
      ],
      embedFn,
    );
    expect(result).toEqual({ embedded: 2, warnings: [] });
    expect(embedFn).toHaveBeenCalledOnce();
    expect(updates).toEqual([
      { id: "a", embedding: "[0,1]" },
      { id: "b", embedding: "[1,2]" },
    ]);
  });

  it("skips items with no embeddable text and never calls the API when none qualify", async () => {
    const { client, updates } = makeClient();
    const embedFn = vi.fn();
    const result = await embedItems(client, [{ id: "a", title: "", summary: null }], embedFn);
    expect(result).toEqual({ embedded: 0, warnings: [] });
    expect(embedFn).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("returns a warning (no throw) when the embedding call fails", async () => {
    const { client } = makeClient();
    const embedFn = vi.fn(async () => {
      throw new Error("quota");
    });
    const result = await embedItems(client, [{ id: "a", title: "x" }], embedFn);
    expect(result.embedded).toBe(0);
    expect(result.warnings[0]).toMatch(/Embedding failed: quota/);
  });

  it("reports rows whose update failed", async () => {
    const { client } = makeClient(new Set(["b"]));
    const embedFn = vi.fn(async (inputs: string[]) => inputs.map(() => [0.1]));
    const result = await embedItems(
      client,
      [
        { id: "a", title: "x" },
        { id: "b", title: "y" },
      ],
      embedFn,
    );
    expect(result.embedded).toBe(1);
    expect(result.warnings[0]).toMatch(/Could not store 1 embedding/);
  });
});
