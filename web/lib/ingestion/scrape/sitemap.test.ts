import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  cleanTitle,
  ingestSitemap,
  parseArticleMeta,
  parseSitemapEntries,
  parseSitemapSource,
  resolvePublishedAt,
  selectArticles,
  sitemapConnector,
  yearFromPath,
} from "./sitemap";
import type { FetchLike } from "../net";
import type { SourceRef } from "../types";

const SITEMAP = readFileSync(join(__dirname, "__fixtures__/sitemap.xml"), "utf8");
const ARTICLE = readFileSync(join(__dirname, "__fixtures__/article.html"), "utf8");

const PREFIX = "/uk/en/Industries/technology/blogs/";
const SITEMAP_URL = "https://www.deloitte.com/uk/sitemaps/sitemap_uk_en.xml";

const source: SourceRef = {
  id: "s1",
  name: "Deloitte UK — Technology blogs",
  category: "Companies & Labs",
  url: `${SITEMAP_URL}#include=${PREFIX}`,
  tags: ["consulting"],
};

describe("parseSitemapSource", () => {
  it("splits the sitemap URL from the #include prefix", () => {
    expect(parseSitemapSource(source.url)).toEqual({
      sitemapUrl: SITEMAP_URL,
      includePrefix: PREFIX,
    });
  });

  it("strips the fragment before fetching — it is never sent to the server", () => {
    expect(parseSitemapSource(source.url).sitemapUrl).not.toContain("#");
  });

  it("returns a null prefix when no #include is given (accept every URL)", () => {
    expect(parseSitemapSource(SITEMAP_URL).includePrefix).toBeNull();
  });

  it("url-decodes an encoded prefix", () => {
    const encoded = `${SITEMAP_URL}#include=${encodeURIComponent(PREFIX)}`;
    expect(parseSitemapSource(encoded).includePrefix).toBe(PREFIX);
  });
});

describe("parseSitemapEntries", () => {
  it("reads every <url> with its loc and lastmod", () => {
    const entries = parseSitemapEntries(SITEMAP);
    expect(entries).toHaveLength(6);
    expect(entries[0]).toEqual({
      loc: "https://www.deloitte.com/uk/en/Industries/technology/blogs/riding-the-wave.html",
      lastmod: "2026-04-01T10:00:00Z",
    });
  });

  it("tolerates a <url> with no <lastmod>", () => {
    const entry = parseSitemapEntries(SITEMAP).find((e) => e.loc.includes("no-lastmod"));
    expect(entry?.lastmod).toBeNull();
  });

  it("returns an empty list for junk rather than throwing", () => {
    expect(parseSitemapEntries("not xml at all")).toEqual([]);
  });
});

describe("selectArticles", () => {
  const entries = parseSitemapEntries(SITEMAP);

  it("keeps only URLs under the include prefix", () => {
    const picked = selectArticles(entries, PREFIX, SITEMAP_URL, 25);
    expect(picked.every((e) => new URL(e.loc).pathname.startsWith(PREFIX))).toBe(true);
    expect(picked.some((e) => e.loc.includes("/careers/"))).toBe(false);
  });

  it("refuses an off-origin URL even when it matches the prefix (hostile sitemap)", () => {
    // A sitemap is untrusted input: it must not be able to point our fetcher at
    // another host (§12.7 / SSRF).
    const picked = selectArticles(entries, PREFIX, SITEMAP_URL, 25);
    expect(picked.some((e) => e.loc.includes("evil.example.net"))).toBe(false);
  });

  it("sorts newest-lastmod first and caps to the budget", () => {
    const picked = selectArticles(entries, PREFIX, SITEMAP_URL, 2);
    expect(picked).toHaveLength(2);
    expect(picked[0].loc).toContain("picture-this"); // 2026-04-24, newest
    expect(picked[1].loc).toContain("riding-the-wave"); // 2026-04-01
  });

  it("sorts entries without a lastmod last, but still includes them", () => {
    const picked = selectArticles(entries, PREFIX, SITEMAP_URL, 25);
    expect(picked.at(-1)?.loc).toContain("no-lastmod");
  });
});

describe("parseArticleMeta", () => {
  const meta = parseArticleMeta(ARTICLE);

  it("takes the ISO datePublished, not the human-readable decoy", () => {
    // The real page ships BOTH `"datePublished": "22 Aug 2023"` and
    // `"datePublished":"2023-08-22T00:00:00.0Z"`. Picking the first match would
    // yield an unparseable date.
    expect(meta.publishedAt).toBe("2023-08-22T00:00:00.000Z");
  });

  it("reads og:title and og:description", () => {
    expect(meta.title).toContain("Riding the generative AI wave");
    expect(meta.summary).toContain("factors shaping the generative AI landscape");
  });

  it("decodes HTML entities in the summary", () => {
    expect(meta.summary).not.toContain("&rsquo;");
  });

  it("never captures the article body — link-first (§7)", () => {
    expect(JSON.stringify(meta)).not.toContain("Full article body");
  });

  it("returns empty fields for a page with no metadata, rather than throwing", () => {
    expect(parseArticleMeta("<html><head></head><body>hi</body></html>")).toEqual({
      title: "",
      summary: "",
      publishedAt: null,
    });
  });
});

describe("cleanTitle", () => {
  it("strips a trailing site-brand segment", () => {
    expect(cleanTitle("Riding the generative AI wave | Deloitte UK", "www.deloitte.com")).toBe(
      "Riding the generative AI wave",
    );
  });

  it("leaves a title whose tail is not the brand alone", () => {
    // Only strip when the trailing segment names the site; otherwise a legitimate
    // pipe in a headline would lose half the title.
    expect(cleanTitle("GPT-4 | A technical review", "www.deloitte.com")).toBe(
      "GPT-4 | A technical review",
    );
  });

  it("handles en/em dash separators too", () => {
    expect(cleanTitle("Picture this — Deloitte UK", "www.deloitte.com")).toBe("Picture this");
  });

  it("leaves an unsuffixed title untouched", () => {
    expect(cleanTitle("Picture this", "www.deloitte.com")).toBe("Picture this");
  });
});

describe("yearFromPath", () => {
  it("reads a year segment from the URL path", () => {
    expect(yearFromPath("/uk/en/Industries/technology/blogs/2023/picture-this.html")).toBe(2023);
  });

  it("returns null when there is no year segment", () => {
    expect(yearFromPath("/uk/en/Industries/technology/blogs/riding-the-wave.html")).toBeNull();
  });

  it("ignores a number that is not a plausible year", () => {
    expect(yearFromPath("/blogs/1234/x.html")).toBeNull();
  });
});

describe("resolvePublishedAt", () => {
  const loc = "https://x.test/blogs/2023/post.html";

  it("prefers the article's own datePublished", () => {
    expect(resolvePublishedAt("2023-08-22T00:00:00.000Z", loc, "2026-04-24T00:00:00Z")).toBe(
      "2023-08-22T00:00:00.000Z",
    );
  });

  it("falls back to the year in the path — never to a misleading lastmod", () => {
    // lastmod is a MODIFICATION date: a 2023 post re-touched in 2026 must not
    // surface as brand new and dominate the recency sort.
    expect(resolvePublishedAt(null, loc, "2026-04-24T00:00:00Z")).toBe("2023-01-01T00:00:00.000Z");
  });

  it("falls back to lastmod only when there is no date anywhere else", () => {
    expect(resolvePublishedAt(null, "https://x.test/blogs/post.html", "2026-04-24T00:00:00Z")).toBe(
      "2026-04-24T00:00:00.000Z",
    );
  });

  it("returns undefined when nothing is known", () => {
    expect(resolvePublishedAt(null, "https://x.test/blogs/post.html", null)).toBeUndefined();
  });
});

describe("sitemapConnector", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(handler: (url: string) => Response | Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn((input: string | URL) => handler(String(input))));
  }
  const ok = (body: string, type: string) =>
    new Response(body, { status: 200, headers: { "content-type": type } });

  it("maps sitemap + article metadata into normalized items", async () => {
    stubFetch((url) =>
      url.endsWith(".xml") ? ok(SITEMAP, "application/xml") : ok(ARTICLE, "text/html"),
    );
    const result = await sitemapConnector(source);
    expect(result.sourceId).toBe("s1");
    expect(result.items.length).toBeGreaterThan(0);
    const item = result.items[0];
    expect(item.title).toBe("Riding the generative AI wave");
    expect(item.category).toBe("Companies & Labs");
    expect(item.tags).toEqual(["consulting"]);
    expect(item.url.startsWith("https://www.deloitte.com")).toBe(true);
  });

  it("never fetches an off-origin URL listed in the sitemap", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return url.endsWith(".xml") ? ok(SITEMAP, "application/xml") : ok(ARTICLE, "text/html");
    });
    await sitemapConnector(source);
    expect(seen.some((u) => u.includes("evil.example.net"))).toBe(false);
  });

  it("refuses an unsafe source URL without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sitemapConnector({ ...source, url: "http://127.0.0.1/sitemap.xml" });
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/private\/loopback/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("warns, never throws, when the sitemap fetch is non-200", async () => {
    stubFetch(() => new Response("nope", { status: 503 }));
    const result = await sitemapConnector(source);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/HTTP 503/);
  });

  it("warns, never throws, when the sitemap fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const result = await sitemapConnector(source);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/socket hang up/);
  });

  it("skips an article whose page fails, keeps the rest, and warns", async () => {
    stubFetch((url) => {
      if (url.endsWith(".xml")) return ok(SITEMAP, "application/xml");
      if (url.includes("picture-this")) return new Response("gone", { status: 404 });
      return ok(ARTICLE, "text/html");
    });
    const result = await sitemapConnector(source);
    expect(result.items.some((i) => i.url.includes("picture-this"))).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /picture-this/.test(w))).toBe(true);
  });

  it("warns when the sitemap yields no matching articles", async () => {
    stubFetch(() => ok(SITEMAP, "application/xml"));
    const result = await sitemapConnector({ ...source, url: `${SITEMAP_URL}#include=/nothing/` });
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/no articles/i);
  });
});

/**
 * Security regressions. Each of these was a real finding on this connector's
 * first draft; they fail loudly if the guard is ever removed.
 */
describe("sitemapConnector — security", () => {
  const NEVER = Date.now() + 60_000;

  /** A FetchLike that records every URL it is asked for. */
  function recorder(handler: (url: string) => Partial<Response> & { status: number }) {
    const seen: string[] = [];
    const impl: FetchLike = async (url) => {
      seen.push(url);
      const r = handler(url);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: async () => (r as { _body?: string })._body ?? "",
        headers: { get: (n: string) => (r.headers as unknown as Record<string, string>)?.[n] ?? null },
        body: null,
      };
    };
    return { impl, seen };
  }
  const page = (status: number, _body: string, headers: Record<string, string> = {}) =>
    ({ status, _body, headers }) as never;

  it("refuses a redirect from an on-origin article to a loopback host (SSRF)", async () => {
    // The <loc> is same-origin and passes selectArticles. The attacker's server
    // then 302s to the cloud-metadata / loopback address. Default `fetch` would
    // follow it transparently.
    const { impl, seen } = recorder((url) => {
      if (url.endsWith(".xml")) return page(200, SITEMAP);
      return page(302, "", { location: "http://169.254.169.254/latest/meta-data/" });
    });
    const result = await ingestSitemap(source, impl, NEVER);
    expect(seen.some((u) => u.includes("169.254.169.254"))).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.warnings.some((w) => /private\/loopback/.test(w))).toBe(true);
  });

  it("refuses a redirect of the sitemap itself to a private host", async () => {
    const { impl, seen } = recorder(() => page(301, "", { location: "http://127.0.0.1:8080/x" }));
    const result = await ingestSitemap(source, impl, NEVER);
    expect(seen.some((u) => u.includes("127.0.0.1"))).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/private\/loopback/);
  });

  it("does not throw on an out-of-range numeric character reference", async () => {
    // `String.fromCodePoint(99999999)` throws RangeError. The connector must
    // never throw — it warns — so one hostile page cannot abort the whole run.
    const hostile = ARTICLE.replace("Riding the generative AI wave", "Boom &#99999999; boom");
    const { impl } = recorder((url) => page(200, url.endsWith(".xml") ? SITEMAP : hostile));
    await expect(ingestSitemap(source, impl, NEVER)).resolves.toBeDefined();
  });

  it("does not throw on an out-of-range reference inside the sitemap itself", async () => {
    const hostile = SITEMAP.replace("riding-the-wave", "riding&#99999999;wave");
    const { impl } = recorder((url) => page(200, url.endsWith(".xml") ? hostile : ARTICLE));
    await expect(ingestSitemap(source, impl, NEVER)).resolves.toBeDefined();
  });

  it("caps how many sitemap entries it parses", () => {
    const many = `<urlset>${"<url><loc>https://a.test/x</loc></url>".repeat(50)}</urlset>`;
    expect(parseSitemapEntries(many, 10)).toHaveLength(10);
  });

  it("stops fetching articles once the time budget is spent", async () => {
    const { impl, seen } = recorder((url) => page(200, url.endsWith(".xml") ? SITEMAP : ARTICLE));
    const past = Date.now() - 1; // already expired
    const result = await ingestSitemap(source, impl, past);
    // sitemap is fetched, no articles are
    expect(seen.filter((u) => !u.endsWith(".xml"))).toEqual([]);
    expect(result.warnings.some((w) => /time budget/.test(w))).toBe(true);
  });
});
