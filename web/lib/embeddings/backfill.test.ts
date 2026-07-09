import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { backfillItemEmbeddings } from "./backfill";

/** Client whose `items` select→is→limit resolves the given null-embedding rows,
 * and whose update→eq chain records writes. `scanError` fails the scan. */
function makeClient(opts: {
  nullRows?: Array<{ id: string; title: string | null; summary: string | null }>;
  scanError?: boolean;
}) {
  const updates: string[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            is() {
              return {
                limit: () =>
                  Promise.resolve(
                    opts.scanError
                      ? { data: null, error: { message: "scan boom" } }
                      : { data: opts.nullRows ?? [], error: null },
                  ),
              };
            },
          };
        },
        update() {
          return {
            eq(_col: string, id: string) {
              updates.push(id);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

describe("backfillItemEmbeddings", () => {
  it("embeds the rows missing an embedding and reports counts", async () => {
    const { client, updates } = makeClient({
      nullRows: [
        { id: "a", title: "x", summary: null },
        { id: "b", title: "y", summary: null },
      ],
    });
    const embedFn = vi.fn(async (inputs: string[]) => inputs.map(() => [0.1]));
    const result = await backfillItemEmbeddings(client, 200, embedFn);
    expect(result).toEqual({ scanned: 2, embedded: 2, warnings: [] });
    expect(updates).toEqual(["a", "b"]);
  });

  it("short-circuits to zero when nothing is missing an embedding", async () => {
    const { client } = makeClient({ nullRows: [] });
    const embedFn = vi.fn();
    const result = await backfillItemEmbeddings(client, 200, embedFn);
    expect(result).toEqual({ scanned: 0, embedded: 0, warnings: [] });
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("throws when the scan read fails", async () => {
    const { client } = makeClient({ scanError: true });
    await expect(backfillItemEmbeddings(client, 200, vi.fn())).rejects.toThrow(/scan boom/);
  });
});
