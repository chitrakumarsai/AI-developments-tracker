import { describe, expect, it } from "vitest";

import { extractCandidateUrls, normalizeUrl, MAX_IMPORT_URLS } from "./extract";

describe("extractCandidateUrls", () => {
  it("extracts multiple URLs from a prose blob", () => {
    const text = `Follow https://a.example.com/feed.xml and
      also https://b.example.com/rss for great takes.`;
    expect(extractCandidateUrls(text)).toEqual([
      "https://a.example.com/feed.xml",
      "https://b.example.com/rss",
    ]);
  });

  it("dedupes within the paste (normalized)", () => {
    const text =
      "https://x.example.com/feed https://X.Example.com/feed/ https://x.example.com/feed#top";
    expect(extractCandidateUrls(text)).toEqual(["https://x.example.com/feed"]);
  });

  it("strips trailing sentence punctuation", () => {
    const text = "See https://a.example.com/feed. Also https://b.example.com/rss,";
    expect(extractCandidateUrls(text)).toEqual([
      "https://a.example.com/feed",
      "https://b.example.com/rss",
    ]);
  });

  it("does not extract unsafe schemes", () => {
    const text =
      "javascript:alert(1) data:text/html,<x> file:///etc/passwd https://ok.example.com/feed";
    expect(extractCandidateUrls(text)).toEqual(["https://ok.example.com/feed"]);
  });

  it("caps the number of URLs", () => {
    const text = Array.from(
      { length: MAX_IMPORT_URLS + 10 },
      (_, i) => `https://s${i}.example.com/feed`,
    ).join(" ");
    expect(extractCandidateUrls(text)).toHaveLength(MAX_IMPORT_URLS);
  });

  it("returns [] for empty or URL-less input", () => {
    expect(extractCandidateUrls("")).toEqual([]);
    expect(extractCandidateUrls("just some words, no links")).toEqual([]);
    expect(extractCandidateUrls(null)).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("lowercases host, drops fragment and trailing slash", () => {
    expect(normalizeUrl("https://Host.Example.com/Path/#frag")).toBe(
      "https://host.example.com/path",
    );
  });
});
