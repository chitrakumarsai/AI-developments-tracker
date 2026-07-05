import { describe, expect, it } from "vitest";

import { buildProfileRow } from "./profile";

describe("buildProfileRow", () => {
  it("assigns the owner role when the email is in the allowlist", () => {
    const row = buildProfileRow({ id: "u1", email: "owner@example.com" }, "owner@example.com");
    expect(row).toEqual({ id: "u1", email: "owner@example.com", role: "owner" });
  });

  it("assigns member for a non-owner email", () => {
    const row = buildProfileRow({ id: "u2", email: "someone@example.com" }, "owner@example.com");
    expect(row.role).toBe("member");
  });

  it("normalizes the stored email to lowercase, trimmed", () => {
    const row = buildProfileRow({ id: "u3", email: "  Owner@Example.COM " }, "owner@example.com");
    expect(row.email).toBe("owner@example.com");
    expect(row.role).toBe("owner");
  });

  it("is a member (never owner) when no allowlist is configured", () => {
    const row = buildProfileRow({ id: "u4", email: "owner@example.com" }, undefined);
    expect(row.role).toBe("member");
  });

  it("keeps a null email null and defaults to member", () => {
    const row = buildProfileRow({ id: "u5", email: null }, "owner@example.com");
    expect(row.email).toBeNull();
    expect(row.role).toBe("member");
  });
});
