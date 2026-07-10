import { describe, expect, it } from "vitest";

import { SOURCE_CATEGORIES } from "../sources/categories";
import {
  FEED_SECTIONS,
  MORE_CATEGORIES,
  categoriesForSlug,
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

describe("the Ask tab (v5)", () => {
  const ask = sectionForSlug("ask");

  it("is a prompt surface, not a content category", () => {
    expect(ask.slug).toBe("ask");
    expect(ask.label).toBe("Ask");
    expect(ask.isPrompt).toBe(true);
    expect(ask.category).toBeNull();
    expect(categoriesForSlug("ask")).toBeNull();
  });

  it("is the only prompt section", () => {
    expect(FEED_SECTIONS.filter((s) => s.isPrompt)).toHaveLength(1);
  });

  it("keeps the legacy 'products' slug working by aliasing it to More", () => {
    // `products` is persisted in saved_views.filters.section and lives in
    // shared URLs. Its content now lives under More, so old links must land
    // there rather than on the Ask prompt surface or a 404-ish All fallback.
    expect(sectionForSlug("products").slug).toBe("more");
    expect(categoriesForSlug("products")).toContain("Products & Tools");
  });
});

describe("the More catch-all tab", () => {
  const dedicated = FEED_SECTIONS.map((s) => s.category).filter(
    (c): c is string => c != null,
  );

  it("collects exactly the source categories that have no dedicated tab", () => {
    expect([...MORE_CATEGORIES].sort()).toEqual(
      [
        "Conferences",
        "Datasets & Benchmarks",
        "Funding & Industry",
        "Newsletters & Blogs",
        // Products & Tools lost its dedicated tab in v5 (that slot became the
        // Ask prompt surface), so it falls into the catch-all automatically.
        "Products & Tools",
        "Video & Podcasts",
      ].sort(),
    );
  });

  it("never overlaps a dedicated tab category", () => {
    for (const c of MORE_CATEGORIES) {
      expect(dedicated).not.toContain(c);
    }
  });

  it("makes every source category reachable by some tab", () => {
    const reachable = new Set<string>([...dedicated, ...MORE_CATEGORIES]);
    for (const c of SOURCE_CATEGORIES) {
      expect(reachable.has(c)).toBe(true);
    }
  });

  it("exposes the More categories via categoriesForSlug, others as null", () => {
    expect(categoriesForSlug("more")).toEqual(MORE_CATEGORIES);
    expect(categoriesForSlug("papers")).toBeNull();
    expect(categoriesForSlug("all")).toBeNull();
    expect(categoryForSlug("more")).toBeNull();
  });
});
