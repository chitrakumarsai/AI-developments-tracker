import type { MetadataRoute } from "next";

import { buildSitemap } from "@/lib/seo/sitemap";

// Served at /sitemap.xml. Logic lives in lib/seo (unit-tested); this is the
// Next convention entrypoint.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}
