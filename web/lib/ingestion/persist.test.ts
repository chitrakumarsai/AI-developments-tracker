import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { persistItems } from "./persist";
import type { IngestionResult, NormalizedItem } from "./types";

/**
 * Minimal stateful fake of the Supabase client that models the unique-url
 * dedupe: an upsert with ignoreDuplicates inserts only rows whose url has not
 * been seen, returning the ids of the genuinely new rows.
 */
function makeFakeClient() {
  const seenUrls = new Set<string>();
  const stamped: string[] = [];

  const client = {
    from(table: string) {
      if (table === "items") {
        return {
          upsert(rows: Array<{ url: string }>) {
            const inserted = rows.filter((r) => !seenUrls.has(r.url));
            inserted.forEach((r) => seenUrls.add(r.url));
            return {
              select: async () => ({
                data: inserted.map((_, i) => ({ id: `id-${i}` })),
                error: null,
              }),
            };
          },
        };
      }
      return {
        update() {
          return {
            eq: async (_col: string, id: string) => {
              stamped.push(id);
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, stamped };
}

function resultWith(urls: string[]): IngestionResult {
  const items: NormalizedItem[] = urls.map((url, i) => ({
    title: `Paper ${i}`,
    url,
    category: "Research Papers",
  }));
  return { sourceId: "src-1", items, warnings: [] };
}

describe("persistItems", () => {
  it("adds all items on first run and stamps the source", async () => {
    const { client, stamped } = makeFakeClient();
    const outcome = await persistItems(client, resultWith(["a", "b", "c"]));

    expect(outcome.added).toBe(3);
    expect(outcome.skipped).toBe(0);
    expect(stamped).toEqual(["src-1"]);
  });

  it("dedupes: re-running the same items adds nothing", async () => {
    const { client } = makeFakeClient();
    await persistItems(client, resultWith(["a", "b", "c"]));
    const second = await persistItems(client, resultWith(["a", "b", "c"]));

    expect(second.added).toBe(0);
    expect(second.skipped).toBe(3);
  });

  it("adds only the new items on an overlapping run", async () => {
    const { client } = makeFakeClient();
    await persistItems(client, resultWith(["a", "b"]));
    const second = await persistItems(client, resultWith(["b", "c", "d"]));

    expect(second.added).toBe(2); // c, d
    expect(second.skipped).toBe(1); // b
  });

  it("handles an empty result without touching items", async () => {
    const { client, stamped } = makeFakeClient();
    const outcome = await persistItems(client, resultWith([]));

    expect(outcome.added).toBe(0);
    expect(outcome.skipped).toBe(0);
    expect(stamped).toEqual(["src-1"]);
  });

  it("carries connector warnings through", async () => {
    const { client } = makeFakeClient();
    const result: IngestionResult = { ...resultWith(["a"]), warnings: ["heads up"] };
    const outcome = await persistItems(client, result);

    expect(outcome.warnings).toContain("heads up");
  });

  it("reports a warning and skips all when the upsert errors", async () => {
    const errorClient = {
      from: () => ({
        upsert: () => ({
          select: async () => ({ data: null, error: { message: "db down" } }),
        }),
      }),
    } as unknown as SupabaseClient;

    const outcome = await persistItems(errorClient, resultWith(["a", "b"]));
    expect(outcome.added).toBe(0);
    expect(outcome.skipped).toBe(2);
    expect(outcome.warnings.join(" ")).toMatch(/db down/);
  });
});
