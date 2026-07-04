import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addCandidates,
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

/**
 * Fake for addCandidates: `select(col)` resolves directly to a row set (the
 * dedupe reads), and `insert` records the bulk payload. Two tables are served.
 */
function makeBulkClient(opts?: {
  candidateUrls?: string[];
  sourceUrls?: string[];
  errorOn?: "source_candidates" | "sources" | "insert";
}) {
  const inserts: Array<{ table: string; rows: unknown }> = [];

  const client = {
    from(table: string) {
      return {
        select(col: string) {
          if (table === "source_candidates" && opts?.errorOn === "source_candidates") {
            return Promise.resolve({ data: null, error: { message: "cand boom" } });
          }
          if (table === "sources" && opts?.errorOn === "sources") {
            return Promise.resolve({ data: null, error: { message: "src boom" } });
          }
          const data =
            col === "url"
              ? (opts?.sourceUrls ?? []).map((url) => ({ url }))
              : (opts?.candidateUrls ?? []).map((handle_or_url) => ({ handle_or_url }));
          return Promise.resolve({ data, error: null });
        },
        insert(rows: unknown) {
          inserts.push({ table, rows });
          const error = opts?.errorOn === "insert" ? { message: "insert boom" } : null;
          return Promise.resolve({ error });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, inserts };
}

describe("addCandidates", () => {
  it("inserts new URLs and reports counts", async () => {
    const { client, inserts } = makeBulkClient();
    const result = await addCandidates(
      [
        { platform: "RSS", handleOrUrl: "https://a.example.com/feed" },
        { platform: "RSS", handleOrUrl: "https://b.example.com/rss" },
      ],
      client,
    );
    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(inserts).toHaveLength(1);
    expect((inserts[0].rows as unknown[]).length).toBe(2);
  });

  it("skips URLs already queued or already a live source (normalized)", async () => {
    const { client, inserts } = makeBulkClient({
      candidateUrls: ["https://a.example.com/feed"],
      sourceUrls: ["https://b.example.com/rss/"],
    });
    const result = await addCandidates(
      [
        { platform: "RSS", handleOrUrl: "https://A.example.com/feed" }, // dupe of a candidate
        { platform: "RSS", handleOrUrl: "https://b.example.com/rss" }, // dupe of a source
        { platform: "RSS", handleOrUrl: "https://c.example.com/new" }, // fresh
      ],
      client,
    );
    expect(result).toEqual({ added: 1, skipped: 2 });
    expect((inserts[0].rows as Array<{ handle_or_url: string }>)[0].handle_or_url).toBe(
      "https://c.example.com/new",
    );
  });

  it("no-ops on empty input without touching the DB", async () => {
    const { client, inserts } = makeBulkClient();
    expect(await addCandidates([], client)).toEqual({ added: 0, skipped: 0 });
    expect(inserts).toHaveLength(0);
  });

  it("throws on DB error", async () => {
    const { client } = makeBulkClient({ errorOn: "insert" });
    await expect(
      addCandidates([{ platform: "RSS", handleOrUrl: "https://x.example.com/feed" }], client),
    ).rejects.toThrow(/insert boom/);
  });
});

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
