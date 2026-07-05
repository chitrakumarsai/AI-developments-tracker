import { describe, expect, test } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  test("allows a same-origin absolute path", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/?window=week&sort=relevant")).toBe("/?window=week&sort=relevant");
  });

  test("falls back to '/' for empty or missing input", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
  });

  test("rejects absolute URLs to other origins", () => {
    expect(safeRedirectPath("https://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("http://evil.com/path")).toBe(DEFAULT_REDIRECT);
  });

  test("rejects protocol-relative URLs", () => {
    expect(safeRedirectPath("//evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("//evil.com/steal")).toBe(DEFAULT_REDIRECT);
  });

  test("rejects backslash and control-character smuggling", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/foo\nbar")).toBe(DEFAULT_REDIRECT);
  });

  test("rejects a relative path that is not origin-absolute", () => {
    expect(safeRedirectPath("settings")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("../secret")).toBe(DEFAULT_REDIRECT);
  });
});
