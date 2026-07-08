/**
 * Single source of truth for which routes are public (indexable, shareable) vs.
 * gated (the signed-in app). robots + sitemap + the page-level `noindex` all
 * read from here so they can never drift apart (2.4 SEO).
 */

/** Publicly indexable paths that belong in the sitemap. */
export const PUBLIC_ROUTES = ["/", "/sign-in"] as const;

/**
 * Path prefixes that must never be crawled or indexed: the gated app, its API,
 * and auth callbacks. Crawlers are told to skip them and the pages emit
 * `noindex` as defense in depth.
 */
export const DISALLOWED_ROUTES = [
  "/feed",
  "/settings",
  "/sources",
  "/api/",
  "/auth/",
] as const;
