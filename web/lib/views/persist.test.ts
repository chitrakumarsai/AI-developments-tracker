import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createView, deleteView, listViews, type SavedView } from "./persist";

/** Fake Supabase client recording calls; terminal ops resolve `{ data, error }`. */
function makeClient(opts?: { rows?: SavedView[]; errorOn?: string }) {
  const calls: Array<{ op: string; payload?: unknown; eq?: unknown }> = [];
  const err = opts?.errorOn ? { message: opts.errorOn } : null;

  const client = {
    from() {
      return {
        insert(payload: unknown) {
          calls.push({ op: "insert", payload });
          return Promise.resolve({ error: err });
        },
        select() {
          return {
            order() {
              return Promise.resolve({ data: opts?.rows ?? [], error: err });
            },
          };
        },
        delete() {
          return {
            eq(col: string, val: string) {
              calls.push({ op: "delete", eq: { [col]: val } });
              return Promise.resolve({ error: err });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("createView", () => {
  it("inserts name + filters", async () => {
    const { client, calls } = makeClient();
    await createView({ name: "Morning read", filters: { section: "repos" } }, client);
    expect(calls).toContainEqual({
      op: "insert",
      payload: { name: "Morning read", filters: { section: "repos" } },
    });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "nope" });
    await expect(
      createView({ name: "x", filters: {} }, client),
    ).rejects.toThrow(/nope/);
  });
});

describe("listViews", () => {
  it("returns the rows", async () => {
    const rows: SavedView[] = [{ id: "1", name: "A", filters: { tag: "rl" } }];
    const { client } = makeClient({ rows });
    expect(await listViews(client)).toEqual(rows);
  });

  it("returns [] when there are no rows", async () => {
    const { client } = makeClient({ rows: [] });
    expect(await listViews(client)).toEqual([]);
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "boom" });
    await expect(listViews(client)).rejects.toThrow(/boom/);
  });
});

describe("deleteView", () => {
  it("deletes by id", async () => {
    const { client, calls } = makeClient();
    await deleteView("view-9", client);
    expect(calls).toContainEqual({ op: "delete", eq: { id: "view-9" } });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "gone" });
    await expect(deleteView("x", client)).rejects.toThrow(/gone/);
  });
});
