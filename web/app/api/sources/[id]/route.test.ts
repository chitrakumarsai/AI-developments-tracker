import { describe, expect, it, vi, beforeEach } from "vitest";

import { DELETE, PATCH } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";
import {
  deleteSource,
  setSourceStatus,
  setSourcePriority,
  updateSourceMeta,
} from "@/lib/sources/persist";

vi.mock("@/lib/auth/session", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/sources/persist", () => ({
  deleteSource: vi.fn(),
  setSourceStatus: vi.fn(),
  setSourcePriority: vi.fn(),
  updateSourceMeta: vi.fn(),
}));

const VALID_ID = "11111111-1111-4111-8111-111111111111";

const asOwner = () =>
  vi.mocked(requireOwner).mockResolvedValue({
    ok: true,
    user: { id: "owner-1", email: "o@e.com", role: "owner" },
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown, raw = false) =>
  new Request("http://localhost/api/sources/x", {
    method: "PATCH",
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(setSourceStatus).mockResolvedValue(undefined);
  vi.mocked(setSourcePriority).mockResolvedValue(undefined);
  vi.mocked(updateSourceMeta).mockResolvedValue(undefined);
  vi.mocked(deleteSource).mockResolvedValue(undefined);
});

const delReq = () =>
  new Request("http://localhost/api/sources/x", { method: "DELETE" });

describe("PATCH /api/sources/[id]", () => {
  it("returns 403 for a non-owner and never mutates", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Owner access required.",
    });
    const res = await PATCH(req({ status: "paused" }), ctx(VALID_ID));
    expect(res.status).toBe(403);
    expect(setSourceStatus).not.toHaveBeenCalled();
  });

  it("returns 401 for an anonymous request", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Sign in required.",
    });
    expect((await PATCH(req({ status: "paused" }), ctx(VALID_ID))).status).toBe(401);
  });

  it("passes the rate-limit response through when limited", async () => {
    asOwner();
    vi.mocked(enforceRateLimit).mockResolvedValue(
      new Response("nope", { status: 429 }) as never,
    );
    const res = await PATCH(req({ status: "paused" }), ctx(VALID_ID));
    expect(res.status).toBe(429);
    expect(setSourceStatus).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid id", async () => {
    asOwner();
    expect((await PATCH(req({ status: "paused" }), ctx("nope"))).status).toBe(400);
  });

  it("returns 400 on non-JSON body", async () => {
    asOwner();
    expect((await PATCH(req("{bad", true), ctx(VALID_ID))).status).toBe(400);
  });

  it("returns 400 on an empty update", async () => {
    asOwner();
    const res = await PATCH(req({}), ctx(VALID_ID));
    expect(res.status).toBe(400);
    expect(setSourceStatus).not.toHaveBeenCalled();
  });

  it("rejects an attempt to edit the url (strict schema)", async () => {
    asOwner();
    const res = await PATCH(req({ url: "https://evil.example.com/feed" }), ctx(VALID_ID));
    expect(res.status).toBe(400);
    expect(updateSourceMeta).not.toHaveBeenCalled();
  });

  it("rejects a partial metadata edit (needs name+category+tags)", async () => {
    asOwner();
    const res = await PATCH(req({ name: "Just a name" }), ctx(VALID_ID));
    expect(res.status).toBe(400);
    expect(updateSourceMeta).not.toHaveBeenCalled();
  });

  it("pauses via status", async () => {
    asOwner();
    const res = await PATCH(req({ status: "paused" }), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(setSourceStatus).toHaveBeenCalledWith(VALID_ID, "paused");
  });

  it("re-weights via priority", async () => {
    asOwner();
    await PATCH(req({ priority: 7 }), ctx(VALID_ID));
    expect(setSourcePriority).toHaveBeenCalledWith(VALID_ID, 7);
  });

  it("edits metadata when all three fields are present", async () => {
    asOwner();
    await PATCH(
      req({ name: "New", category: "Products & Tools", tags: ["agents"] }),
      ctx(VALID_ID),
    );
    expect(updateSourceMeta).toHaveBeenCalledWith(VALID_ID, {
      name: "New",
      category: "Products & Tools",
      tags: ["agents"],
    });
  });

  it("returns 500 (and does not leak in prod) when a write throws", async () => {
    asOwner();
    vi.mocked(setSourceStatus).mockRejectedValue(new Error("db down"));
    expect((await PATCH(req({ status: "archived" }), ctx(VALID_ID))).status).toBe(500);
  });
});

describe("DELETE /api/sources/[id]", () => {
  it("returns 403 for a non-owner and never deletes", async () => {
    vi.mocked(requireOwner).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Owner access required.",
    });
    const res = await DELETE(delReq(), ctx(VALID_ID));
    expect(res.status).toBe(403);
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it("passes the rate-limit response through when limited", async () => {
    asOwner();
    vi.mocked(enforceRateLimit).mockResolvedValue(
      new Response("nope", { status: 429 }) as never,
    );
    const res = await DELETE(delReq(), ctx(VALID_ID));
    expect(res.status).toBe(429);
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid id and never deletes", async () => {
    asOwner();
    const res = await DELETE(delReq(), ctx("nope"));
    expect(res.status).toBe(400);
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it("deletes the source for an owner", async () => {
    asOwner();
    const res = await DELETE(delReq(), ctx(VALID_ID));
    expect(res.status).toBe(200);
    expect(deleteSource).toHaveBeenCalledWith(VALID_ID);
  });

  it("returns 500 when the delete throws", async () => {
    asOwner();
    vi.mocked(deleteSource).mockRejectedValue(new Error("db down"));
    expect((await DELETE(delReq(), ctx(VALID_ID))).status).toBe(500);
  });
});
