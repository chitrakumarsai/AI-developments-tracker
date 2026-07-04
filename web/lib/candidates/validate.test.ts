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
