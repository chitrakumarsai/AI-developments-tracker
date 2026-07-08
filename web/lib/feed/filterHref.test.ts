import { describe, expect, it } from "vitest";

import { feedHref, type FeedHrefParams } from "./filterHref";

describe("feedHref", () => {
  it("returns bare / for empty/default state", () => {
    expect(feedHref()).toBe("/feed");
    expect(feedHref({ section: "all", sort: "relevant", window: "month" })).toBe("/feed");
  });

  it("omits the default window and the relevant sort", () => {
    expect(feedHref({ window: "month" })).toBe("/feed");
    expect(feedHref({ sort: "relevant" })).toBe("/feed");
  });

  it("encodes sort as its URL token", () => {
    expect(feedHref({ sort: "metric" })).toBe("/feed?sort=stars");
    expect(feedHref({ sort: "recent" })).toBe("/feed?sort=recent");
  });

  it("sets section, window, source and paging when non-default", () => {
    expect(feedHref({ section: "repos" })).toBe("/feed?section=repos");
    expect(feedHref({ window: "week" })).toBe("/feed?window=week");
    expect(feedHref({ source: "abc-123" })).toBe("/feed?source=abc-123");
    expect(feedHref({ show: 40 })).toBe("/feed?show=40");
  });

  it("percent-encodes an untrusted tag value", () => {
    expect(feedHref({ tag: "local llm" })).toBe("/feed?tag=local+llm");
    expect(feedHref({ tag: "a&b=c" })).toBe("/feed?tag=a%26b%3Dc");
  });

  it("sets and percent-encodes a search query", () => {
    expect(feedHref({ q: "diffusion" })).toBe("/feed?q=diffusion");
    expect(feedHref({ q: "vision transformer" })).toBe("/feed?q=vision+transformer");
    expect(feedHref({ q: "a&b" })).toBe("/feed?q=a%26b");
  });

  it("omits an empty search query", () => {
    expect(feedHref({ q: "" })).toBe("/feed");
    expect(feedHref({ q: null })).toBe("/feed");
  });

  it("sets the feedback/read state param", () => {
    expect(feedHref({ state: "unread" })).toBe("/feed?state=unread");
    expect(feedHref({ state: "liked" })).toBe("/feed?state=liked");
    expect(feedHref({ state: "hide-down" })).toBe("/feed?state=hide-down");
    expect(feedHref({ state: null })).toBe("/feed");
  });

  it("combines multiple filters in a stable order", () => {
    const href = feedHref({
      section: "social",
      sort: "recent",
      window: "week",
      source: "src-9",
      tag: "agents",
      q: "rlhf",
      show: 60,
    });
    expect(href).toBe(
      "/feed?section=social&sort=recent&window=week&source=src-9&tag=agents&q=rlhf&show=60",
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
      "/feed?section=repos&window=week&tag=rag",
    );
    expect(feedHref({ ...context, tag: null, show: null })).toBe(
      "/feed?section=repos&window=week&source=src-1",
    );
  });
});
