import { describe, it, expect, afterEach, vi } from "vitest";

import { buildRobots } from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildRobots", () => {
  it("allows the public surface and disallows the gated app + api + auth", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    const robots = buildRobots();
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(
      expect.arrayContaining(["/feed", "/settings", "/sources", "/api/", "/auth/"]),
    );
    // The public landing must NOT be disallowed.
    expect(rule.disallow).not.toContain("/");
  });

  it("points at the absolute sitemap and sets the host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    const robots = buildRobots();
    expect(robots.sitemap).toBe("https://theaichronicles.ai/sitemap.xml");
    expect(robots.host).toBe("https://theaichronicles.ai");
  });
});
