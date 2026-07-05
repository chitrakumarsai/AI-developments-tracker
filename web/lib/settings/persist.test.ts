import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSettings, saveSettings } from "./persist";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

function makeClient(opts?: { row?: unknown; error?: string }) {
  const calls: Array<{ op: string; payload?: unknown; onConflict?: string; eq?: Record<string, string> }> = [];
  const client = {
    from() {
      return {
        select() {
          const eqs: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              eqs[col] = val;
              return chain;
            },
            maybeSingle() {
              calls.push({ op: "select", eq: { ...eqs } });
              return Promise.resolve({
                data: opts?.row ?? null,
                error: opts?.error ? { message: opts.error } : null,
              });
            },
          };
          return chain;
        },
        upsert(payload: unknown, options?: { onConflict?: string }) {
          calls.push({ op: "upsert", payload, onConflict: options?.onConflict });
          return Promise.resolve({ error: opts?.error ? { message: opts.error } : null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("getSettings", () => {
  it("returns defaults for an anonymous user without querying", async () => {
    const { client, calls } = makeClient({ row: { top_per_source_day: 5 } });
    expect(await getSettings(null, client)).toEqual(DEFAULT_SETTINGS);
    expect(calls).toHaveLength(0);
  });

  it("returns defaults when the user has no row", async () => {
    const { client } = makeClient();
    expect(await getSettings("user-a", client)).toEqual(DEFAULT_SETTINGS);
  });

  it("scopes the read to the user's own row", async () => {
    const { client, calls } = makeClient({ row: { top_per_source_day: 1 } });
    await getSettings("user-a", client);
    expect(calls[0].eq).toEqual({ user_id: "user-a" });
  });

  it("maps a row (snake→camel, null-coalesced)", async () => {
    const { client } = makeClient({
      row: {
        top_per_source_day: 5,
        include_keywords: ["agents"],
        exclude_keywords: null,
        min_metric: 100,
      },
    });
    expect(await getSettings("user-a", client)).toEqual({
      topPerSourceDay: 5,
      includeKeywords: ["agents"],
      excludeKeywords: [],
      minMetric: 100,
    });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ error: "boom" });
    await expect(getSettings("user-a", client)).rejects.toThrow(/boom/);
  });
});

describe("saveSettings", () => {
  it("upserts the user's row keyed on user_id", async () => {
    const { client, calls } = makeClient();
    const input: AppSettings = {
      topPerSourceDay: 7,
      includeKeywords: ["rl"],
      excludeKeywords: ["crypto"],
      minMetric: 50,
    };
    await saveSettings(input, "user-a", client);
    expect(calls).toHaveLength(1);
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.user_id).toBe("user-a");
    expect(payload.id).toBeUndefined();
    expect(payload.top_per_source_day).toBe(7);
    expect(payload.include_keywords).toEqual(["rl"]);
    expect(payload.exclude_keywords).toEqual(["crypto"]);
    expect(payload.min_metric).toBe(50);
    expect(calls[0].onConflict).toBe("user_id");
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ error: "nope" });
    await expect(saveSettings(DEFAULT_SETTINGS, "user-a", client)).rejects.toThrow(/nope/);
  });
});
