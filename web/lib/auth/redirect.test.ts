import { describe, expect, test } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath, signInPath } from "./redirect";

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

describe("signInPath", () => {
  test("carries the target path as an encoded next param", () => {
    expect(signInPath("/feed")).toBe("/sign-in?next=%2Ffeed");
    expect(signInPath("/settings")).toBe("/sign-in?next=%2Fsettings");
  });

  test("preserves a query string on the target, fully encoded", () => {
    expect(signInPath("/feed?section=repos&window=week")).toBe(
      "/sign-in?next=%2Ffeed%3Fsection%3Drepos%26window%3Dweek",
    );
  });

  test("falls back to the default target for an off-origin or malformed target", () => {
    expect(signInPath("//evil.com")).toBe("/sign-in?next=%2Ffeed");
    expect(signInPath("https://evil.com")).toBe("/sign-in?next=%2Ffeed");
  });
});
