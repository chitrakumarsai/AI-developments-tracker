import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createView, deleteView, listViews, type SavedView } from "./persist";

/** Fake Supabase client recording calls; terminal ops resolve `{ data, error }`. */
function makeClient(opts?: { rows?: SavedView[]; errorOn?: string }) {
  const calls: Array<{ op: string; payload?: unknown; eq?: Record<string, string> }> = [];
  const err = opts?.errorOn ? { message: opts.errorOn } : null;

  const client = {
    from() {
      return {
        insert(payload: unknown) {
          calls.push({ op: "insert", payload });
          return Promise.resolve({ error: err });
        },
        select() {
          const eqs: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              eqs[col] = val;
              return chain;
            },
            order() {
              calls.push({ op: "select", eq: { ...eqs } });
              return Promise.resolve({ data: opts?.rows ?? [], error: err });
            },
          };
          return chain;
        },
        delete() {
          const eqs: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              eqs[col] = val;
              return chain;
            },
            then(resolve: (r: { error: unknown }) => void) {
              calls.push({ op: "delete", eq: { ...eqs } });
              resolve({ error: err });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("createView", () => {
  it("inserts name + filters scoped to the user", async () => {
    const { client, calls } = makeClient();
    await createView({ name: "Morning read", filters: { section: "repos" } }, "user-a", client);
    expect(calls).toContainEqual({
      op: "insert",
      payload: { user_id: "user-a", name: "Morning read", filters: { section: "repos" } },
    });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "nope" });
    await expect(
      createView({ name: "x", filters: {} }, "user-a", client),
    ).rejects.toThrow(/nope/);
  });
});

describe("listViews", () => {
  it("returns the rows, scoped to the user", async () => {
    const rows: SavedView[] = [{ id: "1", name: "A", filters: { tag: "rl" } }];
    const { client, calls } = makeClient({ rows });
    expect(await listViews("user-a", client)).toEqual(rows);
    expect(calls).toContainEqual({ op: "select", eq: { user_id: "user-a" } });
  });

  it("returns [] when there are no rows", async () => {
    const { client } = makeClient({ rows: [] });
    expect(await listViews("user-a", client)).toEqual([]);
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "boom" });
    await expect(listViews("user-a", client)).rejects.toThrow(/boom/);
  });
});

describe("deleteView", () => {
  it("deletes by id AND user_id (defense in depth)", async () => {
    const { client, calls } = makeClient();
    await deleteView("view-9", "user-a", client);
    expect(calls).toContainEqual({ op: "delete", eq: { id: "view-9", user_id: "user-a" } });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "gone" });
    await expect(deleteView("x", "user-a", client)).rejects.toThrow(/gone/);
  });
});
