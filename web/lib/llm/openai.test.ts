import { afterEach, describe, expect, it, vi } from "vitest";

import { embed } from "./openai";

const OK = (data: unknown) =>
  ({ ok: true, json: () => Promise.resolve(data) }) as Response;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe("embed", () => {
  it("returns [] for empty input without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await embed([])).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns one vector per input, ordered by index", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    // Deliberately out of order to prove we sort by `index`.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          OK({
            data: [
              { index: 1, embedding: [0.2, 0.2] },
              { index: 0, embedding: [0.1, 0.1] },
            ],
          }),
        ),
      ),
    );
    const result = await embed(["a", "b"]);
    expect(result).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
    ]);
  });

  it("throws when the API key is missing", async () => {
    await expect(embed(["a"])).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("throws on a non-OK response", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)));
    await expect(embed(["a"])).rejects.toThrow(/OpenAI HTTP 429/);
  });

  it("throws when the row count doesn't match the input count", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(OK({ data: [{ index: 0, embedding: [0.1] }] }))),
    );
    await expect(embed(["a", "b"])).rejects.toThrow(/unexpected embeddings shape/);
  });
});
