import { describe, it, expect, afterEach, vi } from "vitest";

import { siteUrl, absoluteUrl } from "./site";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set, stripped of any trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai/");
    expect(siteUrl()).toBe("https://theaichronicles.ai");
  });

  it("returns just the origin (drops any path in the env value)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com/app");
    expect(siteUrl()).toBe("https://preview.example.com");
  });

  it("falls back to the production apex when the env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe("https://theaichronicles.ai");
  });

  it("falls back to the production apex when the env is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(siteUrl()).toBe("https://theaichronicles.ai");
  });
});

describe("absoluteUrl", () => {
  it("returns the bare origin for the root path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    expect(absoluteUrl("/")).toBe("https://theaichronicles.ai");
    expect(absoluteUrl()).toBe("https://theaichronicles.ai");
  });

  it("joins a same-origin path without doubling slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    expect(absoluteUrl("/feed")).toBe("https://theaichronicles.ai/feed");
  });

  it("tolerates a path missing its leading slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://theaichronicles.ai");
    expect(absoluteUrl("sign-in")).toBe("https://theaichronicles.ai/sign-in");
  });
});
