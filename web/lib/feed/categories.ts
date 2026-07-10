import { SOURCE_CATEGORIES } from "../sources/categories";

/**
 * Feed section tabs → DB `items.category` values. Single source of truth for
 * the header nav and the category filter, so the UI slugs and the stored
 * category strings can never drift apart.
 *
 * `category: null` means "no single-category filter" (the All tab, and the
 * multi-category More tab which uses `categories` instead). Slugs are the URL
 * param (`?section=repos`) and must stay stable — they are shareable state.
 */
export type FeedSection = {
  readonly slug: string;
  readonly label: string;
  readonly category: string | null;
  /**
   * Multi-category tab: filter to ANY of these categories (the More catch-all).
   * Mutually exclusive with a single `category`. Absent on ordinary tabs.
   */
  readonly categories?: readonly string[];
  /**
   * Prompt surface (the Ask tab): renders saved natural-language views instead
   * of a category-filtered item list. Carries no category and ignores the feed
   * filter controls, which don't apply to a prompt.
   */
  readonly isPrompt?: boolean;
};

/** Single-category tabs — the categories that get their own dedicated tab. */
const DEDICATED_CATEGORIES: readonly string[] = [
  "Research Papers",
  "GitHub Repositories",
  "LLM & Other Models",
  "Companies & Labs",
  "Social / Discussion",
];

/**
 * The More catch-all: every source category (CLAUDE.md §3) that has no
 * dedicated tab, so a freshly-ingested feed in one of these categories is
 * reachable instead of being buried under All. Derived from the source
 * taxonomy so the two can never drift — add a source category and it shows up
 * here automatically until it earns its own tab.
 */
export const MORE_CATEGORIES: readonly string[] = SOURCE_CATEGORIES.filter(
  (category) => !DEDICATED_CATEGORIES.includes(category),
);

export const FEED_SECTIONS: readonly FeedSection[] = [
  { slug: "all", label: "All", category: null },
  { slug: "papers", label: "Papers", category: "Research Papers" },
  { slug: "repos", label: "Repos", category: "GitHub Repositories" },
  { slug: "models", label: "Models", category: "LLM & Other Models" },
  { slug: "companies", label: "Companies", category: "Companies & Labs" },
  { slug: "social", label: "Social", category: "Social / Discussion" },
  { slug: "ask", label: "Ask", category: null, isPrompt: true },
  { slug: "more", label: "More", category: null, categories: MORE_CATEGORIES },
] as const;

export const DEFAULT_SECTION_SLUG = "all";

/** The Ask tab's slug — the prompt surface, addressed directly by MyViews. */
export const ASK_SECTION_SLUG = "ask";

/**
 * Retired slugs → the section that now holds their content.
 *
 * `products` had a dedicated Products & Tools tab until v5, when that slot
 * became the Ask prompt surface and its category fell into the More catch-all.
 * The slug is persisted in `saved_views.filters.section` and lives in shared
 * URLs, so it must keep resolving — to More, where the content actually is.
 */
const SECTION_ALIASES: Readonly<Record<string, string>> = {
  products: "more",
};

/** Resolve a URL slug to its section, falling back to All for unknown slugs. */
export function sectionForSlug(slug: string | undefined | null): FeedSection {
  const resolved = (slug && SECTION_ALIASES[slug]) || slug;
  return (
    FEED_SECTIONS.find((section) => section.slug === resolved) ?? FEED_SECTIONS[0]
  );
}

/** DB category for a slug, or null when the slug maps to All / is unknown. */
export function categoryForSlug(slug: string | undefined | null): string | null {
  return sectionForSlug(slug).category;
}

/**
 * The multi-category set for a slug (the More tab), or null for single-category
 * / All tabs. Callers filter with `.in("category", …)` when this is non-null.
 */
export function categoriesForSlug(
  slug: string | undefined | null,
): readonly string[] | null {
  return sectionForSlug(slug).categories ?? null;
}
