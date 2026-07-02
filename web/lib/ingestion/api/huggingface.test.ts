import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { huggingfaceConnector, parseHfModels, parseHfPapers } from "./huggingface";
import type { SourceRef } from "../types";

const PAPERS_FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/hf-daily-papers.json", import.meta.url)), "utf-8"),
);
const MODELS_FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/hf-models.json", import.meta.url)), "utf-8"),
);

const papersSource: SourceRef = {
  id: "hf-papers",
  name: "Hugging Face — Daily Papers",
  category: "Research Papers",
  url: "https://huggingface.co/api/daily_papers",
  tags: ["huggingface", "papers"],
};

const modelsSource: SourceRef = {
  id: "hf-models",
  name: "Hugging Face — Trending models",
  category: "LLM & Other Models",
  url: "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=50",
  tags: ["huggingface", "models"],
};

describe("parseHfPapers", () => {
  it("maps daily papers to normalized items and skips ones missing an id", () => {
    const result = parseHfPapers(PAPERS_FIXTURE, papersSource);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://huggingface.co/papers/2506.12345");
    expect(result.items[0].publishedAt).toBe("2026-06-27T00:00:00.000Z");
    expect(result.warnings).toHaveLength(1);
  });

  it("sanitizes the title (strips tags, decodes entities)", () => {
    const result = parseHfPapers(PAPERS_FIXTURE, papersSource);
    expect(result.items[0].title).toBe("Scaling Laws for Efficient Inference & Serving");
  });

  it("joins author names and inherits source category and tags", () => {
    const result = parseHfPapers(PAPERS_FIXTURE, papersSource);
    expect(result.items[0].author).toBe("Jane Doe, John Roe");
    expect(result.items[0].category).toBe("Research Papers");
    expect(result.items[0].tags).toEqual(["huggingface", "papers"]);
  });
});

describe("parseHfModels", () => {
  it("maps models to normalized items and skips ones missing an id", () => {
    const result = parseHfModels(MODELS_FIXTURE, modelsSource);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("acme/fast-llm-8b");
    expect(result.items[0].url).toBe("https://huggingface.co/acme/fast-llm-8b");
    expect(result.items[0].author).toBe("acme");
    expect(result.items[0].publishedAt).toBe("2026-06-24T12:00:00.000Z");
    expect(result.warnings).toHaveLength(1);
  });

  it("summarizes with pipeline tag and popularity, inherits category", () => {
    const result = parseHfModels(MODELS_FIXTURE, modelsSource);
    expect(result.items[0].summary).toMatch(/text-generation/);
    expect(result.items[0].category).toBe("LLM & Other Models");
  });
});

describe("huggingfaceConnector", () => {
  beforeEach(() => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("dispatches the daily_papers path to the papers parser with auth header", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(PAPERS_FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await huggingfaceConnector(papersSource);
    expect(result.items).toHaveLength(2);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
    expect(calls[0][1].headers.authorization).toBe("Bearer test-token");
  });

  it("dispatches the models path to the models parser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(MODELS_FIXTURE), { status: 200 })));
    const result = await huggingfaceConnector(modelsSource);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].category).toBe("LLM & Other Models");
  });

  it("warns (no crash) when HUGGINGFACE_TOKEN is missing but still fetches", async () => {
    vi.stubEnv("HUGGINGFACE_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(MODELS_FIXTURE), { status: 200 })));
    const result = await huggingfaceConnector(modelsSource);
    expect(result.items).toHaveLength(2);
    expect(result.warnings.some((w) => /no huggingface_token/i.test(w))).toBe(true);
  });

  it("warns for an unknown Hugging Face path (no parser)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
    const result = await huggingfaceConnector({ ...modelsSource, url: "https://huggingface.co/api/datasets" });
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /unsupported hugging face path/i.test(w))).toBe(true);
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    const result = await huggingfaceConnector(papersSource);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /HTTP 429/.test(w))).toBe(true);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await huggingfaceConnector(papersSource);
    expect(result.warnings.some((w) => /network down/.test(w))).toBe(true);
  });
});
