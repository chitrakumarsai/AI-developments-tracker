import { describe, expect, it } from "vitest";

import {
  FEED_SECTIONS,
  categoryForSlug,
  sectionForSlug,
} from "./categories";

describe("feed sections", () => {
  it("maps each section slug to its DB category", () => {
    expect(categoryForSlug("papers")).toBe("Research Papers");
    expect(categoryForSlug("repos")).toBe("GitHub Repositories");
    expect(categoryForSlug("models")).toBe("LLM & Other Models");
    expect(categoryForSlug("companies")).toBe("Companies & Labs");
    expect(categoryForSlug("social")).toBe("Social / Discussion");
    expect(categoryForSlug("products")).toBe("Products & Tools");
  });

  it("treats 'all' as no category filter", () => {
    expect(categoryForSlug("all")).toBeNull();
    expect(sectionForSlug("all").slug).toBe("all");
  });

  it("falls back to the All section for unknown or missing slugs", () => {
    expect(sectionForSlug("bogus").slug).toBe("all");
    expect(categoryForSlug(undefined)).toBeNull();
    expect(categoryForSlug(null)).toBeNull();
  });

  it("uses stable, unique slugs (shareable URL state)", () => {
    const slugs = FEED_SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
