import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAuthorizedCron } from "./cron-auth";

const SECRET = "s3cr3t-token-value";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/cron/refresh", { headers });
}

describe("isAuthorizedCron", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("accepts Vercel's Authorization: Bearer <secret>", () => {
    expect(isAuthorizedCron(requestWith({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it("accepts the x-cron-secret header (manual trigger fallback)", () => {
    expect(isAuthorizedCron(requestWith({ "x-cron-secret": SECRET }))).toBe(true);
  });

  it("rejects a wrong Bearer token", () => {
    expect(isAuthorizedCron(requestWith({ authorization: "Bearer nope" }))).toBe(false);
  });

  it("rejects a wrong x-cron-secret header", () => {
    expect(isAuthorizedCron(requestWith({ "x-cron-secret": "nope" }))).toBe(false);
  });

  it("rejects a request with no auth headers", () => {
    expect(isAuthorizedCron(requestWith({}))).toBe(false);
  });

  it("allows any request when CRON_SECRET is unset (local single-user dev)", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(requestWith({}))).toBe(true);
  });

  it("fails CLOSED when CRON_SECRET is unset on a Vercel deployment", () => {
    delete process.env.CRON_SECRET;
    const originalVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      expect(isAuthorizedCron(requestWith({}))).toBe(false);
    } finally {
      if (originalVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = originalVercel;
    }
  });

  it("fails CLOSED when CRON_SECRET is an empty string on a deployment", () => {
    process.env.CRON_SECRET = "";
    const originalVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      expect(isAuthorizedCron(requestWith({ authorization: "Bearer anything" }))).toBe(false);
    } finally {
      if (originalVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = originalVercel;
    }
  });
});
