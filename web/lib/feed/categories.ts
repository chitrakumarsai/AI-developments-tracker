/**
 * Feed section tabs → DB `items.category` values. Single source of truth for
 * the header nav and the category filter, so the UI slugs and the stored
 * category strings can never drift apart.
 *
 * `category: null` means "no filter" (the All tab). Slugs are the URL param
 * (`?section=repos`) and must stay stable — they are shareable state.
 */
export type FeedSection = {
  readonly slug: string;
  readonly label: string;
  readonly category: string | null;
};

export const FEED_SECTIONS: readonly FeedSection[] = [
  { slug: "all", label: "All", category: null },
  { slug: "papers", label: "Papers", category: "Research Papers" },
  { slug: "repos", label: "Repos", category: "GitHub Repositories" },
  { slug: "models", label: "Models", category: "LLM & Other Models" },
  { slug: "companies", label: "Companies", category: "Companies & Labs" },
  { slug: "social", label: "Social", category: "Social / Discussion" },
  { slug: "products", label: "Products", category: "Products & Tools" },
] as const;

export const DEFAULT_SECTION_SLUG = "all";

/** Resolve a URL slug to its section, falling back to All for unknown slugs. */
export function sectionForSlug(slug: string | undefined | null): FeedSection {
  return (
    FEED_SECTIONS.find((section) => section.slug === slug) ?? FEED_SECTIONS[0]
  );
}

/** DB category for a slug, or null when the slug maps to All / is unknown. */
export function categoryForSlug(slug: string | undefined | null): string | null {
  return sectionForSlug(slug).category;
}
