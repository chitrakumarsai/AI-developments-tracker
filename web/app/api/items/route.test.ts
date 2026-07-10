import { describe, expect, it, vi, beforeEach } from "vitest";

import { GET } from "./route";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { getFeedItems } from "@/lib/feed/queries";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase/ssr", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/feed/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feed/queries")>()),
  getFeedItems: vi.fn(),
}));

function req(query: string) {
  return new Request(`http://localhost/api/items${query}`);
}

/** The category filter `getFeedItems` was actually asked for. */
function filterArg() {
  return vi.mocked(getFeedItems).mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({
    id: "u1",
    email: "e@e.com",
    role: "user",
  } as never);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(getFeedItems).mockResolvedValue([]);
});

describe("GET /api/items — section filtering", () => {
  it("returns 401 for an anonymous request and never queries", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET(req(""));
    expect(res.status).toBe(401);
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("maps a single-category section to `category`", async () => {
    await GET(req("?section=papers"));
    expect(filterArg()).toMatchObject({ category: "Research Papers" });
  });

  it("maps the More catch-all to `categories`, not a bare `category`", async () => {
    // Regression: the route only ever passed `category`, which is null for a
    // multi-category section — so `?section=more` silently returned the whole
    // feed instead of the catch-all's categories.
    await GET(req("?section=more"));
    const filter = filterArg();
    expect(filter?.category).toBeNull();
    expect(filter?.categories).toContain("Newsletters & Blogs");
  });

  it("keeps the legacy `products` slug filtering, via its alias to More", async () => {
    // `products` is persisted in saved_views.filters.section and lives in
    // shared URLs; it must still narrow the feed rather than return everything.
    await GET(req("?section=products"));
    expect(filterArg()?.categories).toContain("Products & Tools");
  });

  it("applies no category filter for the All section", async () => {
    await GET(req("?section=all"));
    const filter = filterArg();
    expect(filter?.category).toBeNull();
    expect(filter?.categories).toBeUndefined();
  });
});
