import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { markRead, recordVote } from "./record";

/**
 * Records the calls a fake Supabase client receives so a test can assert the
 * write path hit the right tables with the right payloads. Each terminal call
 * resolves `{ error }`; pass `errorOn` to make one table fail.
 */
function makeClient(errorOn?: "feedback" | "items") {
  const calls: Array<{ table: string; op: string; payload: unknown; eq?: unknown }> =
    [];

  const client = {
    from(table: string) {
      const err = errorOn === table ? { message: `${table} boom` } : null;
      return {
        insert(payload: unknown) {
          calls.push({ table, op: "insert", payload });
          return Promise.resolve({ error: err });
        },
        update(payload: unknown) {
          return {
            eq(col: string, val: string) {
              calls.push({ table, op: "update", payload, eq: { [col]: val } });
              return Promise.resolve({ error: err });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("recordVote", () => {
  it("appends a history row and updates the item's current vote", async () => {
    const { client, calls } = makeClient();

    await recordVote({ itemId: "item-1", value: "up" }, client);

    expect(calls).toContainEqual({
      table: "feedback",
      op: "insert",
      payload: { item_id: "item-1", value: "up" },
    });
    expect(calls).toContainEqual({
      table: "items",
      op: "update",
      payload: { feedback_value: "up" },
      eq: { id: "item-1" },
    });
  });

  it("clears the vote without writing history when value is null", async () => {
    const { client, calls } = makeClient();

    await recordVote({ itemId: "item-1", value: null }, client);

    expect(calls.some((c) => c.table === "feedback")).toBe(false);
    expect(calls).toContainEqual({
      table: "items",
      op: "update",
      payload: { feedback_value: null },
      eq: { id: "item-1" },
    });
  });

  it("throws when the history insert fails", async () => {
    const { client } = makeClient("feedback");
    await expect(recordVote({ itemId: "x", value: "down" }, client)).rejects.toThrow(
      /feedback boom/,
    );
  });

  it("throws when the item update fails", async () => {
    const { client } = makeClient("items");
    await expect(recordVote({ itemId: "x", value: "up" }, client)).rejects.toThrow(
      /items boom/,
    );
  });
});

describe("markRead", () => {
  it("sets read_state true for the item", async () => {
    const { client, calls } = makeClient();

    await markRead("item-9", client);

    expect(calls).toContainEqual({
      table: "items",
      op: "update",
      payload: { read_state: true },
      eq: { id: "item-9" },
    });
  });

  it("throws when the update fails", async () => {
    const { client } = makeClient("items");
    await expect(markRead("item-9", client)).rejects.toThrow(/items boom/);
  });

  it("writes no feedback history row", async () => {
    const { client, calls } = makeClient();
    await markRead("item-9", client);
    expect(calls.filter((c) => c.table === "feedback")).toHaveLength(0);
  });
});
