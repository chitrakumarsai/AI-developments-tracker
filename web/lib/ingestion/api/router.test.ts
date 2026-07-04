import { afterEach, describe, expect, it, vi } from "vitest";

import { apiConnector } from "./router";
import type { SourceRef } from "../types";

const base: Omit<SourceRef, "url"> = {
  id: "api-1",
  name: "API source",
  category: "GitHub Repositories",
  tags: [],
};

describe("apiConnector (host router)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes api.github.com to the GitHub connector", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
    const result = await apiConnector({
      ...base,
      url: "https://api.github.com/search/repositories?q=topic:llm",
    });
    // Reached the GitHub connector (which returned an empty-but-valid result).
    expect(result.items).toEqual([]);
    expect(result.warnings.every((w) => !/no api connector/i.test(w))).toBe(true);
  });

  it("routes huggingface.co to the Hugging Face connector", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
    const result = await apiConnector({
      ...base,
      url: "https://huggingface.co/api/models?sort=trendingScore",
    });
    // Reached the HF connector (empty-but-valid result, no router-level warning).
    expect(result.items).toEqual([]);
    expect(result.warnings.every((w) => !/no api connector/i.test(w))).toBe(true);
  });

  it("routes www.reddit.com to the Reddit connector", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { children: [] } }), { status: 200 })),
    );
    const result = await apiConnector({
      ...base,
      url: "https://www.reddit.com/r/MachineLearning/top.json?t=month&limit=25",
    });
    // Reached the Reddit connector (empty-but-valid result, no router-level warning).
    expect(result.items).toEqual([]);
    expect(result.warnings.every((w) => !/no api connector/i.test(w))).toBe(true);
  });

  it("warns for a host with no connector yet", async () => {
    const result = await apiConnector({ ...base, url: "https://example.com/api/models" });
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/no api connector for host 'example\.com'/i);
  });

  it("warns on an invalid URL", async () => {
    const result = await apiConnector({ ...base, url: "not a url" });
    expect(result.warnings[0]).toMatch(/invalid api source url/i);
  });
});
