import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSettings, saveSettings } from "./persist";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

function makeClient(opts?: { row?: unknown; error?: string }) {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: opts?.row ?? null,
                    error: opts?.error ? { message: opts.error } : null,
                  });
                },
              };
            },
          };
        },
        upsert(payload: unknown) {
          calls.push({ op: "upsert", payload });
          return Promise.resolve({ error: opts?.error ? { message: opts.error } : null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("getSettings", () => {
  it("returns defaults when no row exists", async () => {
    const { client } = makeClient();
    expect(await getSettings(client)).toEqual(DEFAULT_SETTINGS);
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
    expect(await getSettings(client)).toEqual({
      topPerSourceDay: 5,
      includeKeywords: ["agents"],
      excludeKeywords: [],
      minMetric: 100,
    });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ error: "boom" });
    await expect(getSettings(client)).rejects.toThrow(/boom/);
  });
});

describe("saveSettings", () => {
  it("upserts the singleton with id=1", async () => {
    const { client, calls } = makeClient();
    const input: AppSettings = {
      topPerSourceDay: 7,
      includeKeywords: ["rl"],
      excludeKeywords: ["crypto"],
      minMetric: 50,
    };
    await saveSettings(input, client);
    expect(calls).toHaveLength(1);
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.id).toBe(1);
    expect(payload.top_per_source_day).toBe(7);
    expect(payload.include_keywords).toEqual(["rl"]);
    expect(payload.exclude_keywords).toEqual(["crypto"]);
    expect(payload.min_metric).toBe(50);
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ error: "nope" });
    await expect(saveSettings(DEFAULT_SETTINGS, client)).rejects.toThrow(/nope/);
  });
});
