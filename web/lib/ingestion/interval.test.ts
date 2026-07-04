import { describe, expect, it } from "vitest";

import { isDue, parsePostgresInterval } from "./interval";

describe("parsePostgresInterval", () => {
  it("parses day counts", () => {
    expect(parsePostgresInterval("1 day")).toBe(86_400);
    expect(parsePostgresInterval("2 days")).toBe(172_800);
  });

  it("parses HH:MM:SS time components", () => {
    expect(parsePostgresInterval("24:00:00")).toBe(86_400);
    expect(parsePostgresInterval("01:30:00")).toBe(5_400);
  });

  it("parses a combined 'N days HH:MM:SS' interval", () => {
    expect(parsePostgresInterval("1 day 02:00:00")).toBe(93_600);
  });

  it("parses weeks and hours", () => {
    expect(parsePostgresInterval("1 week")).toBe(604_800);
    expect(parsePostgresInterval("6 hours")).toBe(21_600);
  });

  it("parses months (full word and Postgres 'mon' abbreviation) and years", () => {
    expect(parsePostgresInterval("1 month")).toBe(2_592_000);
    expect(parsePostgresInterval("2 months")).toBe(5_184_000);
    expect(parsePostgresInterval("1 mon")).toBe(2_592_000);
    expect(parsePostgresInterval("1 year")).toBe(31_536_000);
  });

  it("returns null for null, empty, or unparseable input (fail-safe caller treats as due)", () => {
    expect(parsePostgresInterval(null)).toBeNull();
    expect(parsePostgresInterval(undefined)).toBeNull();
    expect(parsePostgresInterval("")).toBeNull();
    expect(parsePostgresInterval("   ")).toBeNull();
    expect(parsePostgresInterval("whenever")).toBeNull();
  });
});

describe("isDue", () => {
  const now = new Date("2026-07-03T12:00:00Z");

  it("is due when never fetched", () => {
    expect(isDue(null, "1 day", now)).toBe(true);
  });

  it("is due when elapsed exactly equals the interval", () => {
    const last = new Date("2026-07-02T12:00:00Z").toISOString(); // exactly 24h ago
    expect(isDue(last, "1 day", now)).toBe(true);
  });

  it("is not due when elapsed is just under the interval", () => {
    const last = new Date("2026-07-02T12:00:01Z").toISOString(); // 1s short of 24h
    expect(isDue(last, "1 day", now)).toBe(false);
  });

  it("is due when well past the interval", () => {
    const last = new Date("2026-06-30T12:00:00Z").toISOString(); // 3 days ago
    expect(isDue(last, "1 day", now)).toBe(true);
  });

  it("respects a longer per-source interval (2 days)", () => {
    const last = new Date("2026-07-02T12:00:00Z").toISOString(); // 1 day ago
    expect(isDue(last, "2 days", now)).toBe(false);
  });

  it("is due (fail-safe) when the interval is unparseable", () => {
    const last = new Date("2026-07-03T11:59:00Z").toISOString(); // 1 min ago
    expect(isDue(last, "whenever", now)).toBe(true);
  });

  it("is due (fail-safe) when the last_fetched timestamp is unparseable", () => {
    expect(isDue("not-a-date", "1 day", now)).toBe(true);
  });
});
