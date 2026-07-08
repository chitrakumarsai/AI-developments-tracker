import type { MetadataRoute } from "next";

import { siteUrl } from "./site";
import { DISALLOWED_ROUTES } from "./routes";

/**
 * Build the robots.txt policy (2.4 SEO): allow crawling the public marketing
 * surface, disallow the gated app + API + auth routes, and point crawlers at the
 * sitemap. The gated pages also emit `noindex` themselves (defense in depth).
 */
export function buildRobots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_ROUTES],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
