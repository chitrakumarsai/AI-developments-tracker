import { describe, expect, test } from "vitest";

import { roleForEmail } from "./role";

describe("roleForEmail", () => {
  test("returns owner when the email matches the allowlist", () => {
    expect(roleForEmail("owner@example.com", "owner@example.com")).toBe("owner");
  });

  test("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(roleForEmail("  Owner@Example.com ", "owner@example.com")).toBe("owner");
  });

  test("supports a comma-separated allowlist of owners", () => {
    expect(roleForEmail("b@x.com", "a@x.com, b@x.com")).toBe("owner");
    expect(roleForEmail("c@x.com", "a@x.com, b@x.com")).toBe("member");
  });

  test("returns member for a non-owner email", () => {
    expect(roleForEmail("someone@else.com", "owner@example.com")).toBe("member");
  });

  test("returns member when either side is missing", () => {
    expect(roleForEmail(null, "owner@example.com")).toBe("member");
    expect(roleForEmail("owner@example.com", null)).toBe("member");
    expect(roleForEmail(undefined, undefined)).toBe("member");
    expect(roleForEmail("", "owner@example.com")).toBe("member");
  });
});
