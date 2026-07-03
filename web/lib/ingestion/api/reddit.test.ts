import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseReddit, redditConnector } from "./reddit";
import type { SourceRef } from "../types";

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/reddit-top.json", import.meta.url)), "utf-8"),
);

const source: SourceRef = {
  id: "reddit-ml",
  name: "Reddit — r/MachineLearning (top)",
  category: "Social / Discussion",
  url: "https://www.reddit.com/r/MachineLearning/top.json?t=month&limit=25",
  tags: ["reddit", "discussion"],
};

describe("parseReddit", () => {
  it("maps posts link-first, falls back to the permalink, skips missing title / no link", () => {
    const result = parseReddit(FIXTURE, source);
    // 2 valid (external link + self-post via url); 2 skipped (no title, no url+permalink).
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://example.com/new-model");
    expect(result.items[1].url).toBe(
      "https://www.reddit.com/r/LocalLLaMA/comments/bbb222/discussion_best_local_llm/",
    );
    expect(result.warnings).toHaveLength(2);
  });

  it("sanitizes the title (decodes entities) and inherits category and tags", () => {
    const result = parseReddit(FIXTURE, source);
    expect(result.items[0].title).toBe("New open-weights model beats GPT-4 on MMLU & GSM8K");
    expect(result.items[0].category).toBe("Social / Discussion");
    expect(result.items[0].tags).toEqual(["reddit", "discussion"]);
  });

  it("stores score as the popularity metric so ranking can normalize it", () => {
    const result = parseReddit(FIXTURE, source);
    expect(result.items[0].metric).toBe(1840);
    expect(result.items[1].metric).toBe(640);
  });

  it("summarizes with upvotes and comments, carries author and an ISO date", () => {
    const result = parseReddit(FIXTURE, source);
    expect(result.items[0].summary).toMatch(/1840 upvotes/);
    expect(result.items[0].summary).toMatch(/312 comments/);
    expect(result.items[0].author).toBe("researcher");
    // created_utc 1782000000 (seconds) → ISO
    expect(result.items[0].publishedAt).toBe(new Date(1782000000 * 1000).toISOString());
  });

  it("falls back to a permalink discussion page when there is no external url", () => {
    const selfOnly = {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              title: "Self post with no external url",
              url: null,
              permalink: "/r/LocalLLaMA/comments/zzz999/self_post/",
              score: 500,
              created_utc: 1782000000,
            },
          },
        ],
      },
    };
    const result = parseReddit(selfOnly, source);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe(
      "https://www.reddit.com/r/LocalLLaMA/comments/zzz999/self_post/",
    );
  });
});

describe("redditConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches (no auth header — keyless) and parses posts", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await redditConnector(source);
    expect(result.items).toHaveLength(2);
    const calls = fetchSpy.mock.calls as unknown as Array<
      [string, { headers: Record<string, string> }]
    >;
    expect(calls[0][1].headers.authorization).toBeUndefined();
    // Reddit rate-limits by User-Agent; a descriptive one must be sent.
    expect(calls[0][1].headers["user-agent"]).toBeTruthy();
  });

  it("returns a warning (no throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 429 })));
    const result = await redditConnector(source);
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => /HTTP 429/.test(w))).toBe(true);
  });

  it("returns a warning (no throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await redditConnector(source);
    expect(result.warnings.some((w) => /network down/.test(w))).toBe(true);
  });

  it("refuses an unsafe (non-http/private) source URL without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await redditConnector({ ...source, url: "http://127.0.0.1/r/x/top.json" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /refusing to fetch/i.test(w))).toBe(true);
  });
});
