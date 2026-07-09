import { describe, expect, it } from "vitest";

import { unsafeUrlReason, ipIsPrivate } from "./net";

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
