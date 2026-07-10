import { describe, expect, it } from "vitest";

import { unsafeUrlReason, ipIsPrivate, fetchFollowingSafeRedirects, readTextCapped } from "./net";

describe("unsafeUrlReason", () => {
  it("allows public http(s) URLs", () => {
    expect(unsafeUrlReason("https://example.com/feed")).toBeNull();
    expect(unsafeUrlReason("http://blog.example.org")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(unsafeUrlReason("javascript:alert(1)")).toMatch(/scheme/);
    expect(unsafeUrlReason("file:///etc/passwd")).toMatch(/scheme/);
  });

  it("rejects private/loopback/metadata hostnames", () => {
    for (const url of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
    ]) {
      expect(unsafeUrlReason(url)).toMatch(/private|loopback/i);
    }
  });
});

describe("ipIsPrivate", () => {
  it("flags IPv4 private, loopback, and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254"]) {
      expect(ipIsPrivate(ip)).toBe(true);
    }
  });

  it("flags IPv6 loopback and unique/link-local ranges", () => {
    expect(ipIsPrivate("::1")).toBe(true);
    expect(ipIsPrivate("fc00::1")).toBe(true);
    expect(ipIsPrivate("fe80::1")).toBe(true);
    expect(ipIsPrivate("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(ipIsPrivate("8.8.8.8")).toBe(false);
    expect(ipIsPrivate("1.1.1.1")).toBe(false);
    expect(ipIsPrivate("2606:4700:4700::1111")).toBe(false);
  });
});

describe("fetchFollowingSafeRedirects", () => {
  const sig = new AbortController().signal;
  const res = (status: number, location?: string) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => "body",
    headers: { get: (n: string) => (n === "location" && location ? location : null) },
  });

  it("re-validates every hop, refusing a redirect to a loopback host", async () => {
    const seen: string[] = [];
    const impl = async (url: string) => {
      seen.push(url);
      return url.includes("start") ? res(302, "http://127.0.0.1/admin") : res(200);
    };
    const out = await fetchFollowingSafeRedirects("https://ok.test/start", impl, sig);
    expect("reason" in out && /private\/loopback/.test(out.reason)).toBe(true);
    expect(seen).toEqual(["https://ok.test/start"]); // never requested the loopback hop
  });

  it("refuses a redirect to the cloud metadata endpoint", async () => {
    const impl = async () => res(307, "http://169.254.169.254/latest/meta-data/");
    const out = await fetchFollowingSafeRedirects("https://ok.test/a", impl, sig);
    expect("reason" in out).toBe(true);
  });

  it("follows a safe redirect chain and returns the final response", async () => {
    const impl = async (url: string) =>
      url.endsWith("/a") ? res(301, "https://ok.test/b") : res(200);
    const out = await fetchFollowingSafeRedirects("https://ok.test/a", impl, sig);
    expect("res" in out && out.res.status).toBe(200);
  });

  it("gives up rather than loop forever", async () => {
    const impl = async () => res(302, "https://ok.test/loop");
    const out = await fetchFollowingSafeRedirects("https://ok.test/loop", impl, sig);
    expect("reason" in out && out.reason).toMatch(/too many redirects/);
  });

  it("rejects a redirect with no Location header", async () => {
    const impl = async () => res(302);
    const out = await fetchFollowingSafeRedirects("https://ok.test/a", impl, sig);
    expect("reason" in out && out.reason).toMatch(/without a location/);
  });
});

describe("readTextCapped", () => {
  it("returns the body when it is under the cap", async () => {
    const res = { ok: true, status: 200, text: async () => "hello", body: null };
    await expect(readTextCapped(res, 100)).resolves.toBe("hello");
  });

  it("refuses a body over the cap rather than buffering it", async () => {
    const res = { ok: true, status: 200, text: async () => "x".repeat(50), body: null };
    await expect(readTextCapped(res, 10)).rejects.toThrow(/exceeds 10 bytes/);
  });

  it("aborts a streamed body once the cap is passed", async () => {
    const chunk = new Uint8Array(8);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 10; i++) c.enqueue(chunk);
        c.close();
      },
    });
    const res = { ok: true, status: 200, text: async () => "", body };
    await expect(readTextCapped(res, 16)).rejects.toThrow(/exceeds 16 bytes/);
  });
});
