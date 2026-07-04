import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createCandidate,
  getCandidate,
  listSuggested,
  promoteCandidate,
  reviewCandidate,
  type SourceCandidate,
} from "./persist";

/**
 * Fake Supabase client recording writes and serving a fixed row set for reads.
 * Mirrors the subset of the chain the candidate persist layer uses.
 */
function makeClient(opts?: { rows?: SourceCandidate[]; errorOn?: string }) {
  const calls: Array<{ table: string; op: string; payload?: unknown; eq?: unknown }> =
    [];

  const client = {
    from(table: string) {
      const err = opts?.errorOn === table ? { message: `${table} boom` } : null;
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
        select() {
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve({ data: opts?.rows ?? [], error: err });
                },
                maybeSingle() {
                  return Promise.resolve({ data: opts?.rows?.[0] ?? null, error: err });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("createCandidate", () => {
  it("inserts a sanitized, suggested candidate", async () => {
    const { client, calls } = makeClient();
    await createCandidate(
      { platform: "RSS", handleOrUrl: "https://x.com/feed", whySuggested: "cited" },
      client,
    );
    expect(calls).toContainEqual({
      table: "source_candidates",
      op: "insert",
      payload: {
        platform: "RSS",
        handle_or_url: "https://x.com/feed",
        why_suggested: "cited",
        state: "suggested",
      },
    });
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ errorOn: "source_candidates" });
    await expect(
      createCandidate({ platform: "p", handleOrUrl: "u" }, client),
    ).rejects.toThrow(/boom/);
  });
});

describe("listSuggested", () => {
  it("returns the queued rows", async () => {
    const rows: SourceCandidate[] = [
      {
        id: "1",
        platform: "RSS",
        handle_or_url: "u",
        why_suggested: null,
        rating: null,
        state: "suggested",
      },
    ];
    const { client } = makeClient({ rows });
    expect(await listSuggested(client)).toEqual(rows);
  });
});

describe("getCandidate", () => {
  it("returns a single row or null", async () => {
    const rows: SourceCandidate[] = [
      {
        id: "9",
        platform: "RSS",
        handle_or_url: "https://x/feed",
        why_suggested: null,
        rating: 4,
        state: "suggested",
      },
    ];
    expect((await getCandidate("9", makeClient({ rows }).client))?.id).toBe("9");
    expect(await getCandidate("nope", makeClient({ rows: [] }).client)).toBeNull();
  });
});

describe("reviewCandidate", () => {
  it("stores a rating on rate", async () => {
    const { client, calls } = makeClient();
    await reviewCandidate("1", { action: "rate", rating: 5 }, client);
    expect(calls).toContainEqual({
      table: "source_candidates",
      op: "update",
      payload: { rating: 5 },
      eq: { id: "1" },
    });
  });

  it("rejects on skip", async () => {
    const { client, calls } = makeClient();
    await reviewCandidate("1", { action: "skip" }, client);
    expect(calls).toContainEqual({
      table: "source_candidates",
      op: "update",
      payload: { state: "rejected" },
      eq: { id: "1" },
    });
  });
});

describe("promoteCandidate", () => {
  it("creates an active source then marks the candidate promoted", async () => {
    const { client, calls } = makeClient();
    await promoteCandidate(
      "1",
      {
        name: "Cool blog",
        category: "Newsletters & Blogs",
        url: "https://x.com/feed",
        ingestionType: "rss",
        tags: ["nlp"],
      },
      client,
    );
    expect(calls).toContainEqual({
      table: "sources",
      op: "insert",
      payload: {
        name: "Cool blog",
        category: "Newsletters & Blogs",
        url: "https://x.com/feed",
        ingestion_type: "rss",
        status: "active",
        tags: ["nlp"],
      },
    });
    expect(calls).toContainEqual({
      table: "source_candidates",
      op: "update",
      payload: { state: "promoted" },
      eq: { id: "1" },
    });
  });

  it("throws (and does not mark promoted) when the source insert fails", async () => {
    const { client, calls } = makeClient({ errorOn: "sources" });
    await expect(
      promoteCandidate(
        "1",
        { name: "n", category: "c", url: "https://x", ingestionType: "rss", tags: [] },
        client,
      ),
    ).rejects.toThrow(/boom/);
    expect(calls.some((c) => c.table === "source_candidates")).toBe(false);
  });
});
