import { describe, expect, it } from "vitest";

import {
  CURATED_PLATFORMS,
  isKnownPlatform,
  platformForItem,
  platformFromSourceName,
  platformForUrl,
} from "./platform";

describe("platformForUrl", () => {
  it("maps curated aggregator hosts to proper labels", () => {
    expect(platformForUrl("https://github.com/acme/fast-llm")).toEqual({
      label: "GitHub",
      slug: "github",
    });
    expect(platformForUrl("https://huggingface.co/Qwen/Qwen3-8B")).toEqual({
      label: "Hugging Face",
      slug: "hugging-face",
    });
    expect(platformForUrl("https://news.ycombinator.com/item?id=1").label).toBe("Hacker News");
    expect(platformForUrl("https://arxiv.org/abs/2506.12345").label).toBe("arXiv");
  });

  it("strips www. and matches subdomains via suffix", () => {
    expect(platformForUrl("https://www.reddit.com/r/LocalLLaMA/comments/x").label).toBe("Reddit");
    expect(platformForUrl("https://old.reddit.com/r/MachineLearning").label).toBe("Reddit");
  });

  it("does not false-match a lookalike host", () => {
    // "notgithub.com" must not match the "github.com" suffix rule.
    expect(platformForUrl("https://notgithub.com/x").label).toBe("Notgithub");
  });

  it("falls back to the registrable domain for company blogs", () => {
    expect(platformForUrl("https://research.google.com/blog/x").label).toBe("Google");
    expect(platformForUrl("https://developer.nvidia.com/blog/x").label).toBe("Nvidia");
  });

  it("returns a neutral platform for malformed or empty URLs", () => {
    expect(platformForUrl("not a url")).toEqual({ label: "Web", slug: "web" });
    expect(platformForUrl("")).toEqual({ label: "Web", slug: "web" });
  });
});

describe("platformFromSourceName", () => {
  it("takes the platform prefix before the spaced separator", () => {
    expect(platformFromSourceName("Hacker News — AI stories")).toEqual({
      label: "Hacker News",
      slug: "hacker-news",
    });
    expect(platformFromSourceName("GitHub — Notable AI repos")?.label).toBe("GitHub");
    expect(platformFromSourceName("Hugging Face — Trending models")?.label).toBe("Hugging Face");
    expect(platformFromSourceName("arXiv — cs.CL")?.label).toBe("arXiv");
  });

  it("uses the whole name when there is no separator", () => {
    expect(platformFromSourceName("Amazon Science")?.label).toBe("Amazon Science");
  });

  it("does not split hyphenated detail words (spaced separator only)", () => {
    // "Machine-Learning" style hyphens inside the detail must not be split on.
    expect(platformFromSourceName("AWS — Machine-Learning Blog")?.label).toBe("AWS");
  });

  it("returns null for blank names", () => {
    expect(platformFromSourceName(null)).toBeNull();
    expect(platformFromSourceName("")).toBeNull();
  });
});

describe("CURATED_PLATFORMS (the platform picker)", () => {
  it("offers GitHub, Hugging Face, Hacker News and arXiv", () => {
    expect(CURATED_PLATFORMS.map((p) => p.slug)).toEqual([
      "github",
      "hugging-face",
      "hacker-news",
      "arxiv",
    ]);
  });

  it("does not offer Reddit — subreddits are reachable via the source filter (v5)", () => {
    expect(CURATED_PLATFORMS.map((p) => p.slug)).not.toContain("reddit");
  });

  it("still labels Reddit items, even though it left the picker", () => {
    // The picker list and host→label resolution are decoupled: dropping the
    // chip must not strip Reddit items of their platform badge.
    expect(platformForUrl("https://old.reddit.com/r/artificial/.rss").label).toBe("Reddit");
    expect(platformFromSourceName("Reddit — r/artificial")?.label).toBe("Reddit");
  });

  it("derives its labels from HOST_MAP so a chip can never show a stale label", () => {
    for (const p of CURATED_PLATFORMS) {
      // The label a chip shows must equal the label an item on that platform gets.
      expect(platformFromSourceName(p.label)).toEqual({ label: p.label, slug: p.slug });
    }
  });
});

describe("isKnownPlatform (the URL/saved-view validator)", () => {
  it("accepts every platform the picker advertises", () => {
    for (const p of CURATED_PLATFORMS) {
      expect(isKnownPlatform(p.slug)).toBe(true);
    }
  });

  it("still accepts Reddit, which left the picker but remains a valid deep link", () => {
    // Validation is deliberately broader than display: `?platform=reddit` and a
    // saved view holding `filters.platform = "reddit"` must keep filtering,
    // rather than silently dropping to an unfiltered feed.
    expect(isKnownPlatform("reddit")).toBe(true);
  });

  it("rejects slugs it cannot resolve", () => {
    expect(isKnownPlatform("myspace")).toBe(false);
    expect(isKnownPlatform("")).toBe(false);
  });
});

describe("platformForItem", () => {
  it("prefers the source name over the URL host", () => {
    // An HN story that links out to GitHub is still 'Hacker News'.
    expect(
      platformForItem({
        url: "https://github.com/acme/x",
        source: { name: "Hacker News — AI stories" },
      }).label,
    ).toBe("Hacker News");
  });

  it("falls back to the URL host when the source is missing", () => {
    expect(platformForItem({ url: "https://huggingface.co/Qwen/Qwen3", source: null }).label).toBe(
      "Hugging Face",
    );
  });
});
