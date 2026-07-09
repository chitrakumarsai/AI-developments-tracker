import { describe, expect, it, vi, beforeEach } from "vitest";

import { DELETE } from "./route";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { deleteProduct } from "@/lib/products/persist";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase/ssr", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/products/persist", () => ({ deleteProduct: vi.fn() }));

const signedIn = () =>
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "e@e.com", role: "user" } as never);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/api/products/p1", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(deleteProduct).mockResolvedValue(undefined);
});

describe("DELETE /api/products/[id]", () => {
  it("returns 401 when anonymous and never deletes", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await DELETE(req(), params("p1"))).status).toBe(401);
    expect(deleteProduct).not.toHaveBeenCalled();
  });

  it("deletes the view scoped to the owner", async () => {
    signedIn();
    const res = await DELETE(req(), params("p1"));
    expect(res.status).toBe(200);
    expect(deleteProduct).toHaveBeenCalledWith("p1", "u1", expect.anything());
  });

  it("returns 500 when the delete throws", async () => {
    signedIn();
    vi.mocked(deleteProduct).mockRejectedValue(new Error("boom"));
    expect((await DELETE(req(), params("p1"))).status).toBe(500);
  });
});
