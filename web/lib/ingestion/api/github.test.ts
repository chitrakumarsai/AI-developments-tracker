import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildGithubSearchUrl, githubConnector, parseGithubSearch } from "./github";
import type { SourceRef } from "../types";

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/github-search.json", import.meta.url)), "utf-8"),
);

const source: SourceRef = {
  id: "gh-1",
  name: "GitHub — Notable AI repos",
  category: "GitHub Repositories",
  url: "https://api.github.com/search/repositories?q=topic:llm+topic:agents",
  tags: ["github", "repos"],
};

describe("parseGithubSearch", () => {
  it("maps repos to normalized items and skips ones missing a url", () => {
    const result = parseGithubSearch(FIXTURE, source);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("acme/fast-llm");
    expect(result.items[0].url).toBe("https://github.com/acme/fast-llm");
    expect(result.items[0].author).toBe("acme");
    expect(result.items[0].publishedAt).toBe("2026-06-28T10:00:00Z");
    expect(result.warnings).toHaveLength(1);
  });

  it("sanitizes the description (strips tags, decodes entities)", () => {
    const result = parseGithubSearch(FIXTURE, source);
    expect(result.items[0].summary).toBe("A fast LLM inference engine & toolkit");
  });

  it("inherits source category and tags", () => {
    const result = parseGithubSearch(FIXTURE, source);
    expect(result.items[0].category).toBe("GitHub Repositories");
    expect(result.items[0].tags).toEqual(["github", "repos"]);
  });

  it("maps stargazers_count onto the popularity metric", () => {
    const result = parseGithubSearch(FIXTURE, source);
    expect(result.items[0].metric).toBe(12000);
    expect(result.items[1].metric).toBe(8200);
  });

  it("captures forks_count as a second, additive popularity signal", () => {
    const result = parseGithubSearch(FIXTURE, source);
    expect(result.items[0].forks).toBe(1500);
    expect(result.items[1].forks).toBe(640);
  });
});

describe("buildGithubSearchUrl", () => {
  it("injects a rolling pushed window, stars sort, and per_page", () => {
    const url = new URL(buildGithubSearchUrl(source.url));
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("q")).toMatch(/topic:llm.*pushed:>=\d{4}-\d{2}-\d{2}/);
  });
});

describe("githubConnector", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetches with auth header and parses repos", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await githubConnector(source);
    expect(result.items).toHaveLength(2);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
    expect(calls[0][1].headers.authorization).toBe("Bearer test-token");
  });

  it("warns (no crash) when GITHUB_TOKEN is missing but still fetches", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 })));
    const result = await githubConnector(source);
    expect(result.items).toHaveLength(2);
    expect(result.warnings.some((w) => /no github_token/i.test(w))).toBe(true);
  });

  it("returns a warning (no throw) on a rate-limit / non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 403 })));
    const result = await githubConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /HTTP 403/.test(w))).toBe(true);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await githubConnector(source);
    expect(result.warnings.some((w) => /network down/.test(w))).toBe(true);
  });
});
