import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import { validateFeedUrl } from "@/lib/candidates/validate";
import { createSource } from "@/lib/sources/persist";

vi.mock("@/lib/auth/session", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/candidates/validate", () => ({ validateFeedUrl: vi.fn() }));
vi.mock("@/lib/sources/persist", () => ({ createSource: vi.fn() }));

const asOwner = () =>
  vi.mocked(requireOwner).mockResolvedValue({
    ok: true,
    user: { id: "owner-1", email: "o@e.com", role: "owner" },
  });

function req(body: unknown, raw = false) {
  return new Request("http://localhost/api/sources", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const validBody = {
  name: "Eugene Yan",
  url: "https://eugeneyan.com/rss/",
  category: "Newsletters & Blogs",
  ingestionType: "rss",
  tags: ["ml"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(validateFeedUrl).mockResolvedValue({ ok: true, sampleCount: 5 });
  vi.mocked(createSource).mockResolvedValue({ id: "src-1" });
});

describe("POST /api/sources", () => {
  it("returns 403 for a signed-in non-owner and never writes", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Owner access required.",
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createSource).not.toHaveBeenCalled();
  });

  it("returns 401 for an anonymous request", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Sign in required.",
    });
    expect((await POST(req(validBody))).status).toBe(401);
  });

  it("passes the rate-limit response through when limited", async () => {
    asOwner();
    const limited = new Response("nope", { status: 429 });
    vi.mocked(enforceRateLimit).mockResolvedValue(limited as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(validateFeedUrl).not.toHaveBeenCalled();
  });

  it("returns 400 on non-JSON body", async () => {
    asOwner();
    expect((await POST(req("{not json", true))).status).toBe(400);
  });

  it("returns 400 on an invalid payload", async () => {
    asOwner();
    const res = await POST(req({ ...validBody, url: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(createSource).not.toHaveBeenCalled();
  });

  it("returns 422 with the reason when feed validation fails, no write", async () => {
    asOwner();
    vi.mocked(validateFeedUrl).mockResolvedValue({ ok: false, reason: "no items found" });
    const res = await POST(req(validBody));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/no items found/);
    expect(createSource).not.toHaveBeenCalled();
  });

  it("validates then creates the source and returns its id", async () => {
    asOwner();
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: "src-1" } });
    expect(validateFeedUrl).toHaveBeenCalledWith("https://eugeneyan.com/rss/", "rss");
    expect(createSource).toHaveBeenCalledWith({
      name: "Eugene Yan",
      category: "Newsletters & Blogs",
      url: "https://eugeneyan.com/rss/",
      ingestionType: "rss",
      tags: ["ml"],
    });
  });

  it("returns 500 when the write throws", async () => {
    asOwner();
    vi.mocked(createSource).mockRejectedValue(new Error("db down"));
    expect((await POST(req(validBody))).status).toBe(500);
  });
});
