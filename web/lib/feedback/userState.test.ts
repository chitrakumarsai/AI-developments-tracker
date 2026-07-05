import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { annotateWithUserState, loadUserItemState } from "./userState";
import type { FeedbackValue } from "../supabase/types";

type Row = { id: string; feedback_value: FeedbackValue | null; read_state: boolean };

function row(id: string): Row {
  return { id, feedback_value: null, read_state: false };
}

/** Fake client returning canned feedback + item_reads rows, recording `.in` args. */
function makeClient(opts: {
  feedback?: Array<{ item_id: string; value: FeedbackValue }>;
  reads?: Array<{ item_id: string }>;
  error?: "feedback" | "item_reads";
}) {
  const inArgs: Record<string, string[]> = {};
  const userArgs: Record<string, string> = {};
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              userArgs[table] = val;
              return {
                in(_inCol: string, ids: string[]) {
                  inArgs[table] = ids;
                  const error = opts.error === table ? { message: `${table} boom` } : null;
                  const data =
                    table === "feedback" ? (opts.feedback ?? []) : (opts.reads ?? []);
                  return Promise.resolve({ data, error });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inArgs, userArgs };
}

describe("annotateWithUserState", () => {
  it("overlays this user's vote + read-state, ignoring the Phase-1 global columns", () => {
    // Pretend the global columns still carry another user's leftover values.
    const items: Row[] = [
      { id: "a", feedback_value: "down", read_state: true },
      { id: "b", feedback_value: "up", read_state: true },
    ];
    const state = {
      votes: new Map<string, FeedbackValue>([["a", "up"]]),
      reads: new Set<string>(["a"]),
    };
    const out = annotateWithUserState(items, state);
    // "a" reflects THIS user; "b" has no per-user signal → reset to unvoted/unread.
    expect(out[0]).toMatchObject({ id: "a", feedback_value: "up", read_state: true });
    expect(out[1]).toMatchObject({ id: "b", feedback_value: null, read_state: false });
  });

  it("does not mutate the input rows", () => {
    const items: Row[] = [{ id: "a", feedback_value: "up", read_state: true }];
    annotateWithUserState(items, { votes: new Map(), reads: new Set() });
    expect(items[0]).toEqual({ id: "a", feedback_value: "up", read_state: true });
  });
});

describe("loadUserItemState", () => {
  it("returns empty state for an anonymous user without querying", async () => {
    const { client, inArgs } = makeClient({});
    const state = await loadUserItemState(client, null, ["a", "b"]);
    expect(state.votes.size).toBe(0);
    expect(state.reads.size).toBe(0);
    expect(inArgs).toEqual({});
  });

  it("returns empty state for an empty pool without querying", async () => {
    const { client, inArgs } = makeClient({ feedback: [{ item_id: "a", value: "up" }] });
    const state = await loadUserItemState(client, "user-a", []);
    expect(state.votes.size).toBe(0);
    expect(inArgs).toEqual({});
  });

  it("builds vote + read maps scoped to the user and the pool ids", async () => {
    const { client, inArgs, userArgs } = makeClient({
      feedback: [{ item_id: "a", value: "up" }, { item_id: "b", value: "down" }],
      reads: [{ item_id: "b" }],
    });
    const state = await loadUserItemState(client, "user-a", ["a", "b", "c"]);
    expect(state.votes.get("a")).toBe("up");
    expect(state.votes.get("b")).toBe("down");
    expect(state.reads.has("b")).toBe(true);
    expect(state.reads.has("a")).toBe(false);
    expect(inArgs.feedback).toEqual(["a", "b", "c"]);
    expect(inArgs.item_reads).toEqual(["a", "b", "c"]);
    // Defense in depth: both queries are scoped to the requesting user.
    expect(userArgs.feedback).toBe("user-a");
    expect(userArgs.item_reads).toBe("user-a");
  });

  it("throws when the feedback read fails", async () => {
    const { client } = makeClient({ error: "feedback" });
    await expect(loadUserItemState(client, "user-a", ["a"])).rejects.toThrow(/feedback boom/);
  });

  it("throws when the read-state read fails", async () => {
    const { client } = makeClient({ error: "item_reads" });
    await expect(loadUserItemState(client, "user-a", ["a"])).rejects.toThrow(/item_reads boom/);
  });
});

describe("annotate + no-op for missing ids", () => {
  it("leaves items with no matching state unvoted/unread", () => {
    const out = annotateWithUserState([row("x")], { votes: new Map(), reads: new Set() });
    expect(out[0]).toEqual({ id: "x", feedback_value: null, read_state: false });
  });
});
