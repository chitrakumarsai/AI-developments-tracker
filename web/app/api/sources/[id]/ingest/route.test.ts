import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import { runIngestion } from "@/lib/ingestion/run";

vi.mock("@/lib/auth/session", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/ingestion/run", () => ({ runIngestion: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: vi.fn(() => ({})) }));

const VALID_ID = "11111111-1111-4111-8111-111111111111";

const asOwner = () =>
  vi.mocked(requireOwner).mockResolvedValue({
    ok: true,
    user: { id: "owner-1", email: "o@e.com", role: "owner" },
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/api/sources/x/ingest", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(runIngestion).mockResolvedValue({ added: 3, sources: 1, perSource: [] });
});

describe("POST /api/sources/[id]/ingest", () => {
  it("returns 403 for a non-owner and never runs ingestion", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Owner access required.",
    });
    const res = await POST(req(), ctx(VALID_ID));
    expect(res.status).toBe(403);
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("passes the rate-limit response through when limited", async () => {
    asOwner();
    vi.mocked(enforceRateLimit).mockResolvedValue(
      new Response("nope", { status: 429 }) as never,
    );
    const res = await POST(req(), ctx(VALID_ID));
    expect(res.status).toBe(429);
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid id", async () => {
    asOwner();
    const res = await POST(req(), ctx("all"));
    expect(res.status).toBe(400);
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("runs ingestion for the one source and returns the summary", async () => {
    asOwner();
    const res = await POST(req(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { added: 3, sources: 1, perSource: [] },
    });
    expect(runIngestion).toHaveBeenCalledWith(expect.anything(), { sourceId: VALID_ID });
  });

  it("returns 500 when ingestion throws", async () => {
    asOwner();
    vi.mocked(runIngestion).mockRejectedValue(new Error("boom"));
    expect((await POST(req(), ctx(VALID_ID))).status).toBe(500);
  });
});
