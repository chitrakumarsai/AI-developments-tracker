import { describe, expect, it } from "vitest";

import { validateFeedUrl, type FetchLike } from "./validate";

const RSS_OK = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
  <item><title>Hello</title><link>https://example.com/a</link></item>
</channel></rss>`;

const RSS_EMPTY = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;

/** A fake fetch returning a fixed body, so no real network is hit. */
function fakeFetch(body: string, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, text: async () => body });
}

type Step = { status: number; location?: string; body?: string };

/**
 * A fake fetch that plays a sequence of responses (one per hop) and records the
 * URLs it was asked for — lets us assert redirect-following and per-hop SSRF.
 * The last step repeats if the loop keeps going.
 */
function seqFetch(steps: Step[]): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetch: FetchLike = async (input) => {
    urls.push(input);
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    return {
      ok: step.status < 400,
      status: step.status,
      text: async () => step.body ?? "",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "location" ? (step.location ?? null) : null,
      },
    };
  };
  return { fetch, urls };
}

describe("validateFeedUrl", () => {
  it("rejects a private/loopback host before fetching (SSRF guard)", async () => {
    let fetched = false;
    const spyFetch: FetchLike = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => RSS_OK };
    };
    const result = await validateFeedUrl("http://127.0.0.1/feed", "rss", spyFetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/private|loopback/);
    expect(fetched).toBe(false);
  });

  it("rejects a non-http scheme", async () => {
    const result = await validateFeedUrl("javascript:alert(1)", "rss", fakeFetch(RSS_OK));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/scheme/);
  });

  it("accepts a reachable feed that parses ≥1 item", async () => {
    const result = await validateFeedUrl(
      "https://example.com/feed.xml",
      "rss",
      fakeFetch(RSS_OK),
    );
    expect(result.ok).toBe(true);
    expect(result.sampleCount).toBe(1);
  });

  it("rejects a feed with no items", async () => {
    const result = await validateFeedUrl(
      "https://example.com/empty.xml",
      "rss",
      fakeFetch(RSS_EMPTY),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no items/);
  });

  it("rejects a non-feed body", async () => {
    const result = await validateFeedUrl(
      "https://example.com/page.html",
      "rss",
      fakeFetch("<html><body>not a feed</body></html>"),
    );
    expect(result.ok).toBe(false);
  });

  it("reports an HTTP error status", async () => {
    const result = await validateFeedUrl(
      "https://example.com/gone",
      "rss",
      fakeFetch("", false, 404),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/404/);
  });

  it("follows a safe redirect, then validates the final feed", async () => {
    const { fetch, urls } = seqFetch([
      { status: 302, location: "https://example.com/final.xml" },
      { status: 200, body: RSS_OK },
    ]);
    const result = await validateFeedUrl("https://example.com/feed", "rss", fetch);
    expect(result.ok).toBe(true);
    expect(result.sampleCount).toBe(1);
    expect(urls).toEqual(["https://example.com/feed", "https://example.com/final.xml"]);
  });

  it("blocks a redirect to a private/metadata host and never fetches it", async () => {
    const { fetch, urls } = seqFetch([
      { status: 302, location: "http://169.254.169.254/latest/meta-data" },
    ]);
    const result = await validateFeedUrl("https://example.com/feed", "rss", fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/private|loopback/);
    // Only the original URL was fetched — the private hop was rejected pre-request.
    expect(urls).toEqual(["https://example.com/feed"]);
  });

  it("rejects a redirect with no Location header", async () => {
    const { fetch } = seqFetch([{ status: 301 }]);
    const result = await validateFeedUrl("https://example.com/feed", "rss", fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/location/i);
  });

  it("rejects a redirect chain that is too long", async () => {
    const { fetch } = seqFetch([{ status: 302, location: "https://loop.example.com/x" }]);
    const result = await validateFeedUrl("https://start.example.com/feed", "rss", fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many redirects/);
  });

  it("only checks URL safety for manual sources (no fetch)", async () => {
    let fetched = false;
    const spyFetch: FetchLike = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => "" };
    };
    const result = await validateFeedUrl("https://example.com", "manual", spyFetch);
    expect(result.ok).toBe(true);
    expect(fetched).toBe(false);
  });
});
