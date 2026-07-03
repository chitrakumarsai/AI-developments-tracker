import { describe, expect, it } from "vitest";

import { feedHref, type FeedHrefParams } from "./filterHref";

describe("feedHref", () => {
  it("returns bare / for empty/default state", () => {
    expect(feedHref()).toBe("/");
    expect(feedHref({ section: "all", sort: "relevant", window: "month" })).toBe("/");
  });

  it("omits the default window and the relevant sort", () => {
    expect(feedHref({ window: "month" })).toBe("/");
    expect(feedHref({ sort: "relevant" })).toBe("/");
  });

  it("encodes sort as its URL token", () => {
    expect(feedHref({ sort: "metric" })).toBe("/?sort=stars");
    expect(feedHref({ sort: "recent" })).toBe("/?sort=recent");
  });

  it("sets section, window, source and paging when non-default", () => {
    expect(feedHref({ section: "repos" })).toBe("/?section=repos");
    expect(feedHref({ window: "week" })).toBe("/?window=week");
    expect(feedHref({ source: "abc-123" })).toBe("/?source=abc-123");
    expect(feedHref({ show: 40 })).toBe("/?show=40");
  });

  it("percent-encodes an untrusted tag value", () => {
    expect(feedHref({ tag: "local llm" })).toBe("/?tag=local+llm");
    expect(feedHref({ tag: "a&b=c" })).toBe("/?tag=a%26b%3Dc");
  });

  it("combines multiple filters in a stable order", () => {
    const href = feedHref({
      section: "social",
      sort: "recent",
      window: "week",
      source: "src-9",
      tag: "agents",
      show: 60,
    });
    expect(href).toBe(
      "/?section=social&sort=recent&window=week&source=src-9&tag=agents&show=60",
    );
  });

  it("drops a single param while preserving the rest (clear-one-pill pattern)", () => {
    const context: FeedHrefParams = {
      section: "repos",
      window: "week",
      source: "src-1",
      tag: "rag",
    };
    expect(feedHref({ ...context, source: null, show: null })).toBe(
      "/?section=repos&window=week&tag=rag",
    );
    expect(feedHref({ ...context, tag: null, show: null })).toBe(
      "/?section=repos&window=week&source=src-1",
    );
  });
});
