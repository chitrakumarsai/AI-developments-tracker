import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createProduct, deleteProduct, listProducts } from "./persist";

/** Fake client for createProduct: records the insert, serves `.select().single()`. */
function makeInsertClient(opts?: { errorOn?: "products"; id?: string }) {
  const calls: Array<{ table: string; payload: unknown }> = [];
  const err = opts?.errorOn === "products" ? { message: "products boom" } : null;
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: err ? null : { id: opts?.id ?? "new-id" },
                  error: err,
                }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

/** Fake client for listProducts: `products` select→eq→order, `product_items` select→in. */
function makeListClient(opts?: {
  products?: Array<{ id: string; title: string; prompt: string; created_at: string }>;
  links?: Array<{ product_id: string }>;
  errorOn?: "products" | "product_items";
}) {
  const client = {
    from(table: string) {
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve(
                  opts?.errorOn === "products"
                    ? { data: null, error: { message: "products boom" } }
                    : { data: opts?.products ?? [], error: null },
                ),
            }),
          }),
        };
      }
      // product_items
      return {
        select: () => ({
          in: () =>
            Promise.resolve(
              opts?.errorOn === "product_items"
                ? { data: null, error: { message: "links boom" } }
                : { data: opts?.links ?? [], error: null },
            ),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client };
}

/** Fake client for deleteProduct: records the `.delete().eq().eq()` chain. */
function makeDeleteClient(opts?: { errorOn?: "products" }) {
  const calls: Array<{ col: string; val: string }> = [];
  const err = opts?.errorOn === "products" ? { message: "del boom" } : null;
  const client = {
    from() {
      return {
        delete() {
          return {
            eq(col: string, val: string) {
              calls.push({ col, val });
              return {
                eq(col2: string, val2: string) {
                  calls.push({ col: col2, val: val2 });
                  return Promise.resolve({ error: err });
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

describe("createProduct", () => {
  it("inserts a user-owned product and returns its id", async () => {
    const { client, calls } = makeInsertClient({ id: "p1" });
    const result = await createProduct(
      { title: "Local LLM tricks", prompt: "best local llm inference tips" },
      "user-1",
      client,
    );
    expect(result).toEqual({ id: "p1" });
    expect(calls).toEqual([
      {
        table: "products",
        payload: {
          user_id: "user-1",
          title: "Local LLM tricks",
          prompt: "best local llm inference tips",
        },
      },
    ]);
  });

  it("throws on DB error", async () => {
    const { client } = makeInsertClient({ errorOn: "products" });
    await expect(
      createProduct({ title: "t", prompt: "p" }, "user-1", client),
    ).rejects.toThrow(/products boom/);
  });
});

describe("listProducts", () => {
  it("returns products newest-first, annotated with snapshot size", async () => {
    const { client } = makeListClient({
      products: [
        { id: "a", title: "A", prompt: "pa", created_at: "2026-07-09T00:00:00Z" },
        { id: "b", title: "B", prompt: "pb", created_at: "2026-07-08T00:00:00Z" },
      ],
      links: [{ product_id: "a" }, { product_id: "a" }, { product_id: "a" }], // b empty
    });
    const result = await listProducts("user-1", client);
    expect(result.map((p) => [p.id, p.itemCount])).toEqual([
      ["a", 3],
      ["b", 0],
    ]);
  });

  it("returns [] without counting when the user has no products", async () => {
    const { client } = makeListClient({ products: [] });
    expect(await listProducts("user-1", client)).toEqual([]);
  });

  it("throws when the products read fails", async () => {
    const { client } = makeListClient({ errorOn: "products" });
    await expect(listProducts("user-1", client)).rejects.toThrow(/products boom/);
  });

  it("throws when the snapshot count read fails", async () => {
    const { client } = makeListClient({
      products: [{ id: "a", title: "A", prompt: "pa", created_at: "2026-07-09T00:00:00Z" }],
      errorOn: "product_items",
    });
    await expect(listProducts("user-1", client)).rejects.toThrow(/links boom/);
  });
});

describe("deleteProduct", () => {
  it("scopes the delete to the id AND the owner", async () => {
    const { client, calls } = makeDeleteClient();
    await deleteProduct("p1", "user-1", client);
    expect(calls).toEqual([
      { col: "id", val: "p1" },
      { col: "user_id", val: "user-1" },
    ]);
  });

  it("throws on DB error", async () => {
    const { client } = makeDeleteClient({ errorOn: "products" });
    await expect(deleteProduct("p1", "user-1", client)).rejects.toThrow(/del boom/);
  });
});
