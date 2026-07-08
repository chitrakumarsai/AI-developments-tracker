import type { MetadataRoute } from "next";

import { absoluteUrl } from "./site";
import { PUBLIC_ROUTES } from "./routes";

/**
 * Build the sitemap (2.4 SEO): only the public, indexable routes. The gated app
 * is intentionally absent — it is disallowed in robots and emits `noindex`.
 * A single `lastModified` (build time) is fine for these near-static pages.
 */
export function buildSitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified,
    changeFrequency: route === "/" ? ("daily" as const) : ("monthly" as const),
    priority: route === "/" ? 1 : 0.5,
  }));
}
