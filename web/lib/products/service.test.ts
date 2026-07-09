import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPromptView, refreshPromptView } from "./service";
import { buildSnapshot } from "./search";
import { createProduct, getProductPrompt, replaceSnapshot } from "./persist";

vi.mock("./search", () => ({ buildSnapshot: vi.fn() }));
vi.mock("./persist", () => ({
  createProduct: vi.fn(),
  getProductPrompt: vi.fn(),
  replaceSnapshot: vi.fn(),
}));
vi.mock("../llm/openai", () => ({ embed: vi.fn(), chatComplete: vi.fn() }));

const snapshot = { embedding: [0.1, 0.2], items: [{ id: "i1", rank: 0, score: null }] };

/** Update chain used by refresh: `.update().eq().eq()` resolves { error }. */
function makeClient(updateError: string | null = null) {
  return {
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: updateError ? { message: updateError } : null }) }) }),
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildSnapshot).mockResolvedValue(snapshot);
  vi.mocked(createProduct).mockResolvedValue({ id: "p1" });
  vi.mocked(replaceSnapshot).mockResolvedValue(undefined);
});

describe("createPromptView", () => {
  it("builds the snapshot, creates the product with its embedding, then writes the snapshot", async () => {
    const client = makeClient();
    const result = await createPromptView({ title: "T", prompt: "P" }, "u1", client);

    expect(result).toEqual({ id: "p1" });
    expect(buildSnapshot).toHaveBeenCalledWith("P", expect.objectContaining({ client }));
    expect(createProduct).toHaveBeenCalledWith(
      { title: "T", prompt: "P", embedding: snapshot.embedding },
      "u1",
      client,
    );
    expect(replaceSnapshot).toHaveBeenCalledWith("p1", snapshot.items, client);
  });
});

describe("refreshPromptView", () => {
  it("returns false and does no work when the view isn't the user's", async () => {
    vi.mocked(getProductPrompt).mockResolvedValue(null);
    const ok = await refreshPromptView("p1", "u1", makeClient());
    expect(ok).toBe(false);
    expect(buildSnapshot).not.toHaveBeenCalled();
    expect(replaceSnapshot).not.toHaveBeenCalled();
  });

  it("rebuilds the snapshot for the user's view", async () => {
    vi.mocked(getProductPrompt).mockResolvedValue({ title: "T", prompt: "P2" });
    const ok = await refreshPromptView("p1", "u1", makeClient());
    expect(ok).toBe(true);
    expect(buildSnapshot).toHaveBeenCalledWith("P2", expect.anything());
    expect(replaceSnapshot).toHaveBeenCalledWith("p1", snapshot.items, expect.anything());
  });

  it("throws when the embedding/updated_at update fails", async () => {
    vi.mocked(getProductPrompt).mockResolvedValue({ title: "T", prompt: "P2" });
    await expect(refreshPromptView("p1", "u1", makeClient("update boom"))).rejects.toThrow(
      /update boom/,
    );
  });
});
