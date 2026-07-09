import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSource,
  listSourcesWithCounts,
  setSourceStatus,
  setSourcePriority,
  updateSourceMeta,
} from "./persist";
import type { SourceRow } from "../supabase/types";

/**
 * Fake client for the single-table `.update(payload).eq("id", id)` mutations.
 * Records the update payload + id filter; `errorOn:"sources"` fails the write.
 */
function makeUpdateClient(opts?: { errorOn?: "sources" }) {
  const calls: Array<{ table: string; payload: unknown; id: unknown }> = [];
  const err = opts?.errorOn === "sources" ? { message: "sources boom" } : null;

  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          return {
            eq(col: string, val: string) {
              calls.push({ table, payload, id: { [col]: val } });
              return Promise.resolve({ error: err });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

/**
 * Fake client for createSource: records the insert payload and serves the
 * `.select("id").single()` tail. `errorOn:"sources"` makes the insert fail.
 */
function makeInsertClient(opts?: { errorOn?: "sources"; id?: string }) {
  const calls: Array<{ table: string; payload: unknown }> = [];
  const err = opts?.errorOn === "sources" ? { message: "sources boom" } : null;

  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: err ? null : { id: opts?.id ?? "new-id" },
                    error: err,
                  });
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
 * Fake client for listSourcesWithCounts: `sources` select resolves the ordered
 * catalog; `items` select resolves `source_id` rows for the in-memory tally.
 */
function makeListClient(opts?: {
  sources?: SourceRow[];
  itemSourceIds?: string[];
  errorOn?: "sources" | "items";
}) {
  const client = {
    from(table: string) {
      if (table === "sources") {
        const order1 = {
          order() {
            if (opts?.errorOn === "sources") {
              return Promise.resolve({ data: null, error: { message: "src boom" } });
            }
            return Promise.resolve({ data: opts?.sources ?? [], error: null });
          },
        };
        return {
          select() {
            return { order: () => order1 };
          },
        };
      }
      // items
      return {
        select() {
          if (opts?.errorOn === "items") {
            return Promise.resolve({ data: null, error: { message: "items boom" } });
          }
          return Promise.resolve({
            data: (opts?.itemSourceIds ?? []).map((source_id) => ({ source_id })),
            error: null,
          });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client };
}

function sourceRow(id: string, over: Partial<SourceRow> = {}): SourceRow {
  return {
    id,
    name: `Source ${id}`,
    category: "Newsletters & Blogs",
    url: `https://example.com/${id}`,
    ingestion_type: "rss",
    status: "active",
    priority: 0,
    tags: [],
    notes: null,
    added_on: "2026-07-08T00:00:00Z",
    last_fetched: null,
    refresh_interval: "1 day",
    ...over,
  };
}

describe("createSource", () => {
  it("inserts a sanitized, active source and returns its id", async () => {
    const { client, calls } = makeInsertClient({ id: "src-1" });
    const result = await createSource(
      {
        name: "Eugene Yan",
        category: "Newsletters & Blogs",
        url: "https://eugeneyan.com/rss/",
        ingestionType: "rss",
        tags: ["ml"],
      },
      client,
    );

    expect(result).toEqual({ id: "src-1" });
    expect(calls).toEqual([
      {
        table: "sources",
        payload: {
          name: "Eugene Yan",
          category: "Newsletters & Blogs",
          url: "https://eugeneyan.com/rss/",
          ingestion_type: "rss",
          status: "active",
          tags: ["ml"],
        },
      },
    ]);
  });

  it("throws on DB error", async () => {
    const { client } = makeInsertClient({ errorOn: "sources" });
    await expect(
      createSource(
        { name: "n", category: "c", url: "https://x", ingestionType: "rss", tags: [] },
        client,
      ),
    ).rejects.toThrow(/sources boom/);
  });
});

describe("listSourcesWithCounts", () => {
  it("annotates each source with its item count, zero when none", async () => {
    const { client } = makeListClient({
      sources: [sourceRow("a"), sourceRow("b")],
      itemSourceIds: ["a", "a", "a"], // b has none
    });
    const rows = await listSourcesWithCounts(client);
    expect(rows.map((r) => [r.id, r.itemCount])).toEqual([
      ["a", 3],
      ["b", 0],
    ]);
  });

  it("returns an empty list without counting items when there are no sources", async () => {
    const { client } = makeListClient({ sources: [] });
    expect(await listSourcesWithCounts(client)).toEqual([]);
  });

  it("throws when the sources read fails", async () => {
    const { client } = makeListClient({ errorOn: "sources" });
    await expect(listSourcesWithCounts(client)).rejects.toThrow(/src boom/);
  });

  it("throws when the item count read fails", async () => {
    const { client } = makeListClient({ sources: [sourceRow("a")], errorOn: "items" });
    await expect(listSourcesWithCounts(client)).rejects.toThrow(/items boom/);
  });

  it("sinks archived sources to the bottom, keeping live order", async () => {
    const { client } = makeListClient({
      sources: [
        sourceRow("z", { status: "archived" }),
        sourceRow("a", { status: "active" }),
        sourceRow("b", { status: "paused" }),
      ],
    });
    const rows = await listSourcesWithCounts(client);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "z"]);
  });
});

describe("setSourceStatus", () => {
  it("updates the status for the given id", async () => {
    const { client, calls } = makeUpdateClient();
    await setSourceStatus("s1", "paused", client);
    expect(calls).toEqual([
      { table: "sources", payload: { status: "paused" }, id: { id: "s1" } },
    ]);
  });

  it("throws on DB error", async () => {
    const { client } = makeUpdateClient({ errorOn: "sources" });
    await expect(setSourceStatus("s1", "archived", client)).rejects.toThrow(/sources boom/);
  });
});

describe("setSourcePriority", () => {
  it("clamps and rounds the priority before writing", async () => {
    const { client, calls } = makeUpdateClient();
    await setSourcePriority("s1", 250.7, client);
    expect(calls[0].payload).toEqual({ priority: 100 });

    const below = makeUpdateClient();
    await setSourcePriority("s1", -5, below.client);
    expect(below.calls[0].payload).toEqual({ priority: 0 });

    const mid = makeUpdateClient();
    await setSourcePriority("s1", 3.4, mid.client);
    expect(mid.calls[0].payload).toEqual({ priority: 3 });
  });

  it("throws on DB error", async () => {
    const { client } = makeUpdateClient({ errorOn: "sources" });
    await expect(setSourcePriority("s1", 5, client)).rejects.toThrow(/sources boom/);
  });
});

describe("updateSourceMeta", () => {
  it("writes sanitized name/category/tags and never the url", async () => {
    const { client, calls } = makeUpdateClient();
    await updateSourceMeta(
      "s1",
      { name: "New name", category: "Products & Tools", tags: ["agents"] },
      client,
    );
    expect(calls[0]).toEqual({
      table: "sources",
      payload: { name: "New name", category: "Products & Tools", tags: ["agents"] },
      id: { id: "s1" },
    });
    expect(calls[0].payload).not.toHaveProperty("url");
  });

  it("throws on DB error", async () => {
    const { client } = makeUpdateClient({ errorOn: "sources" });
    await expect(
      updateSourceMeta("s1", { name: "n", category: "c", tags: [] }, client),
    ).rejects.toThrow(/sources boom/);
  });
});
