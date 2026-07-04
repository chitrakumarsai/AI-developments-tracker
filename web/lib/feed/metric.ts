/**
 * How to present an item's popularity metric, per platform.
 *
 * The feed mixes different popularity signals under one `items.metric` column:
 * GitHub counts stars, Hugging Face models count likes, and Reddit/Hacker News
 * count community engagement (upvotes/points). Showing every one as "★ … likes"
 * (the old behaviour) mislabels discussion items — a Reddit post's number is
 * upvotes, not likes. This maps the derived platform to the right icon + word so
 * the reader can judge traction at a glance without opening the item.
 */

export type MetricMeta = {
  /** Glyph shown before the number (decorative; the label carries meaning). */
  readonly icon: string;
  /** Human word for the metric, e.g. "upvotes", "stars". */
  readonly label: string;
};

const STARS: MetricMeta = { icon: "★", label: "stars" };
const LIKES: MetricMeta = { icon: "♥", label: "likes" };

/**
 * Resolve the icon + label for an item's metric. Keyed on the derived platform
 * slug (see `platformForItem`), with a category fallback for sources that have a
 * metric but no curated platform (repos → stars, else likes).
 */
export function metricMeta(platformSlug: string, category: string): MetricMeta {
  switch (platformSlug) {
    case "reddit":
      return { icon: "▲", label: "upvotes" };
    case "hacker-news":
      return { icon: "▲", label: "points" };
    case "github":
      return STARS;
    case "hugging-face":
      return LIKES;
    default:
      return category === "GitHub Repositories" ? STARS : LIKES;
  }
}
