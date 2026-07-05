import { describe, expect, it } from "vitest";

import { normalizeSettings } from "./normalize";
import { DEFAULT_SETTINGS, MAX_TOP_PER_SOURCE_DAY } from "./types";

describe("normalizeSettings", () => {
  it("clamps topPerSourceDay into range and treats null as unlimited", () => {
    expect(normalizeSettings({ topPerSourceDay: 5 }).topPerSourceDay).toBe(5);
    expect(normalizeSettings({ topPerSourceDay: 0 }).topPerSourceDay).toBeNull();
    expect(normalizeSettings({ topPerSourceDay: 9999 }).topPerSourceDay).toBe(
      MAX_TOP_PER_SOURCE_DAY,
    );
    expect(normalizeSettings({ topPerSourceDay: null }).topPerSourceDay).toBeNull();
  });

  it("lowercases, trims, dedupes, and caps keywords", () => {
    const out = normalizeSettings({
      includeKeywords: ["  Agents ", "agents", "RL", ""],
      excludeKeywords: ["Crypto"],
    });
    expect(out.includeKeywords).toEqual(["agents", "rl"]);
    expect(out.excludeKeywords).toEqual(["crypto"]);
  });

  it("clamps minMetric and rejects non-numbers", () => {
    expect(normalizeSettings({ minMetric: 50 }).minMetric).toBe(50);
    expect(normalizeSettings({ minMetric: -5 }).minMetric).toBeNull();
    expect(normalizeSettings({ minMetric: "lots" }).minMetric).toBeNull();
  });

  it("returns defaults for non-object input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores unknown/junk fields", () => {
    const out = normalizeSettings({ topPerSourceDay: 3, evil: "x", __proto__: {} });
    expect(out).toEqual({
      topPerSourceDay: 3,
      includeKeywords: [],
      excludeKeywords: [],
      minMetric: null,
    });
  });
});
