import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { markRead, recordVote } from "./record";

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  onConflict?: unknown;
  eq?: Record<string, string>;
};

/**
 * Records the calls a fake Supabase client receives so a test can assert the
 * per-user write path (2.2) hit the right table with the right payload. Terminal
 * calls resolve `{ error }`; pass `errorOn` to make a table fail. Both `upsert`
 * and `delete().eq().eq()` chains are supported.
 */
function makeClient(errorOn?: "feedback" | "item_reads") {
  const calls: Call[] = [];

  const client = {
    from(table: string) {
      const err = errorOn === table ? { message: `${table} boom` } : null;
      return {
        upsert(payload: unknown, options?: { onConflict?: string }) {
          calls.push({ table, op: "upsert", payload, onConflict: options?.onConflict });
          return Promise.resolve({ error: err });
        },
        delete() {
          const eqs: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              eqs[col] = val;
              return chain;
            },
            then(resolve: (r: { error: unknown }) => void) {
              calls.push({ table, op: "delete", eq: { ...eqs } });
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

describe("recordVote", () => {
  it("upserts the user's vote keyed on (user_id, item_id)", async () => {
    const { client, calls } = makeClient();

    await recordVote({ itemId: "item-1", value: "up" }, "user-a", client);

    expect(calls).toContainEqual({
      table: "feedback",
      op: "upsert",
      payload: { user_id: "user-a", item_id: "item-1", value: "up" },
      onConflict: "user_id,item_id",
    });
  });

  it("deletes only this user's row when value is null (toggle-off)", async () => {
    const { client, calls } = makeClient();

    await recordVote({ itemId: "item-1", value: null }, "user-a", client);

    expect(calls).toContainEqual({
      table: "feedback",
      op: "delete",
      eq: { user_id: "user-a", item_id: "item-1" },
    });
    // Never touches the global items table anymore.
    expect(calls.some((c) => c.table === "items")).toBe(false);
  });

  it("never writes another user's or the global items row", async () => {
    const { client, calls } = makeClient();
    await recordVote({ itemId: "item-1", value: "down" }, "user-b", client);
    expect(calls.every((c) => c.table === "feedback")).toBe(true);
    const upsert = calls.find((c) => c.op === "upsert");
    expect((upsert?.payload as { user_id: string }).user_id).toBe("user-b");
  });

  it("throws when the upsert fails", async () => {
    const { client } = makeClient("feedback");
    await expect(
      recordVote({ itemId: "x", value: "down" }, "user-a", client),
    ).rejects.toThrow(/feedback boom/);
  });

  it("throws when the clear delete fails", async () => {
    const { client } = makeClient("feedback");
    await expect(
      recordVote({ itemId: "x", value: null }, "user-a", client),
    ).rejects.toThrow(/feedback boom/);
  });
});

describe("markRead", () => {
  it("upserts an item_reads row for this user", async () => {
    const { client, calls } = makeClient();

    await markRead("item-9", "user-a", client);

    expect(calls).toContainEqual({
      table: "item_reads",
      op: "upsert",
      payload: { user_id: "user-a", item_id: "item-9" },
      onConflict: "user_id,item_id",
    });
    // No global items write.
    expect(calls.some((c) => c.table === "items")).toBe(false);
  });

  it("throws when the upsert fails", async () => {
    const { client } = makeClient("item_reads");
    await expect(markRead("item-9", "user-a", client)).rejects.toThrow(/item_reads boom/);
  });
});
