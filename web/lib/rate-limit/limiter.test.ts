import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clientIp, enforceRateLimit } from "./limiter";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/api", { headers });
}

describe("clientIp", () => {
  it("takes the left-most x-forwarded-for entry", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when no forwarded-for", () => {
    expect(clientIp(reqWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no ip headers are present", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

describe("enforceRateLimit — fails open when Upstash is not configured", () => {
  beforeEach(() => {
    // Both accepted naming conventions must be absent to prove fail-open.
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the request (returns null) when the store env is absent", async () => {
    expect(await enforceRateLimit("feedback", "user:123")).toBeNull();
    expect(await enforceRateLimit("candidates", "user:abc")).toBeNull();
    expect(await enforceRateLimit("cron", "1.2.3.4")).toBeNull();
  });
});
