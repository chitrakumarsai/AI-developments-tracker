import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import { runDiscovery } from "@/lib/discovery/discover";

vi.mock("@/lib/auth/session", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/discovery/discover", () => ({ runDiscovery: vi.fn() }));

const SUMMARY = {
  scannedSources: 3,
  fetched: 12,
  hostsFound: 2,
  proposed: 2,
  skipped: 1,
  warnings: [],
};

const asOwner = () =>
  vi.mocked(requireOwner).mockResolvedValue({
    ok: true,
    user: { id: "owner-1", email: "o@e.com", role: "owner" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(runDiscovery).mockResolvedValue(SUMMARY);
});

describe("POST /api/discovery/run", () => {
  it("returns 403 for a non-owner and never runs discovery", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Owner access required.",
    });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(runDiscovery).not.toHaveBeenCalled();
  });

  it("returns 401 for an anonymous request", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Sign in required.",
    });
    expect((await POST()).status).toBe(401);
  });

  it("passes the rate-limit response through when limited", async () => {
    asOwner();
    vi.mocked(enforceRateLimit).mockResolvedValue(
      new Response("nope", { status: 429 }) as never,
    );
    const res = await POST();
    expect(res.status).toBe(429);
    expect(runDiscovery).not.toHaveBeenCalled();
  });

  it("runs discovery and returns the summary", async () => {
    asOwner();
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: SUMMARY });
  });

  it("returns 500 when discovery throws", async () => {
    asOwner();
    vi.mocked(runDiscovery).mockRejectedValue(new Error("boom"));
    expect((await POST()).status).toBe(500);
  });
});
