import { describe, expect, it } from "vitest";

import { metricMeta } from "./metric";

describe("metricMeta", () => {
  it("labels Reddit engagement as upvotes", () => {
    expect(metricMeta("reddit", "Social / Discussion")).toEqual({
      icon: "▲",
      label: "upvotes",
    });
  });

  it("labels Hacker News engagement as points", () => {
    expect(metricMeta("hacker-news", "Social / Discussion")).toEqual({
      icon: "▲",
      label: "points",
    });
  });

  it("labels GitHub repos as stars", () => {
    expect(metricMeta("github", "GitHub Repositories").label).toBe("stars");
  });

  it("labels Hugging Face models as likes", () => {
    expect(metricMeta("hugging-face", "LLM & Other Models").label).toBe("likes");
  });

  it("falls back by category when the platform has no curated mapping", () => {
    expect(metricMeta("web", "GitHub Repositories").label).toBe("stars");
    expect(metricMeta("web", "Newsletters & Blogs").label).toBe("likes");
  });
});
