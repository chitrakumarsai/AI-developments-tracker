import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "./route";
import { getSessionUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { refreshPromptView } from "@/lib/products/service";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/ssr", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/products/service", () => ({ refreshPromptView: vi.fn() }));

const signedIn = () =>
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "e@e.com", role: "user" } as never);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/api/products/p1/refresh", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(refreshPromptView).mockResolvedValue(true);
});

describe("POST /api/products/[id]/refresh", () => {
  it("returns 401 when anonymous", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await POST(req(), params("p1"))).status).toBe(401);
    expect(refreshPromptView).not.toHaveBeenCalled();
  });

  it("passes the rate-limit response through", async () => {
    signedIn();
    vi.mocked(enforceRateLimit).mockResolvedValue(new Response("no", { status: 429 }) as never);
    expect((await POST(req(), params("p1"))).status).toBe(429);
  });

  it("returns 404 when the view isn't the user's", async () => {
    signedIn();
    vi.mocked(refreshPromptView).mockResolvedValue(false);
    expect((await POST(req(), params("p1"))).status).toBe(404);
  });

  it("refreshes the user's view", async () => {
    signedIn();
    const res = await POST(req(), params("p1"));
    expect(res.status).toBe(200);
    expect(refreshPromptView).toHaveBeenCalledWith("p1", "u1", expect.anything());
  });

  it("returns 500 when the service throws", async () => {
    signedIn();
    vi.mocked(refreshPromptView).mockRejectedValue(new Error("boom"));
    expect((await POST(req(), params("p1"))).status).toBe(500);
  });
});
