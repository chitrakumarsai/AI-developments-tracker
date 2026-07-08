import type { MetadataRoute } from "next";

import { buildRobots } from "@/lib/seo/robots";

// Served at /robots.txt. Logic lives in lib/seo (unit-tested); this is the
// Next convention entrypoint.
export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
