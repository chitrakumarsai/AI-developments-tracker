import { describe, it, expect, afterEach, vi } from "vitest";

import { buildSitemap } from "./sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildSitemap", () => {
  it("lists only the public routes as absolute URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    const urls = buildSitemap().map((entry) => entry.url);

    expect(urls).toContain("https://theaichronicles.ai");
    expect(urls).toContain("https://theaichronicles.ai/sign-in");
    // No gated route may leak into the sitemap.
    expect(urls.some((u) => u.includes("/feed"))).toBe(false);
    expect(urls.some((u) => u.includes("/settings"))).toBe(false);
    expect(urls.some((u) => u.includes("/sources"))).toBe(false);
  });

  it("prioritizes the landing over secondary public routes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    const landing = buildSitemap().find(
      (e) => e.url === "https://theaichronicles.ai",
    );
    expect(landing?.priority).toBe(1);
  });
});
