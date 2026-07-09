import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "./route";
import { getSessionUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { createPromptView } from "@/lib/products/service";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/ssr", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/products/service", () => ({ createPromptView: vi.fn() }));

const signedIn = () =>
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "e@e.com", role: "user" } as never);

function req(body: unknown, raw = false) {
  return new Request("http://localhost/api/products", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const validBody = { title: "Local LLM", prompt: "efficient inference on consumer GPUs" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(createPromptView).mockResolvedValue({ id: "p1" });
});

describe("POST /api/products", () => {
  it("returns 401 for an anonymous request and never creates", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(createPromptView).not.toHaveBeenCalled();
  });

  it("passes the rate-limit response through when limited", async () => {
    signedIn();
    vi.mocked(enforceRateLimit).mockResolvedValue(new Response("nope", { status: 429 }) as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(createPromptView).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    signedIn();
    const res = await POST(req("not json", true));
    expect(res.status).toBe(400);
    expect(createPromptView).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid payload (missing prompt)", async () => {
    signedIn();
    const res = await POST(req({ title: "x" }));
    expect(res.status).toBe(400);
    expect(createPromptView).not.toHaveBeenCalled();
  });

  it("returns 400 when the prompt exceeds the max length", async () => {
    signedIn();
    const res = await POST(req({ title: "x", prompt: "p".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("creates the view for the signed-in user and returns its id", async () => {
    signedIn();
    const res = await POST(req(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { id: "p1" } });
    expect(createPromptView).toHaveBeenCalledWith(
      { title: "Local LLM", prompt: "efficient inference on consumer GPUs" },
      "u1",
      expect.anything(),
    );
  });

  it("returns 500 when the service throws", async () => {
    signedIn();
    vi.mocked(createPromptView).mockRejectedValue(new Error("openai down"));
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/openai down/);
  });
});
