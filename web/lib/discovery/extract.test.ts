import { describe, expect, it } from "vitest";

import { extractOutboundHosts, normalizeHost } from "./extract";

describe("normalizeHost", () => {
  it("lowercases and strips a leading www.", () => {
    expect(normalizeHost("WWW.Example.COM")).toBe("example.com");
    expect(normalizeHost("blog.example.com")).toBe("blog.example.com");
  });
});

describe("extractOutboundHosts", () => {
  const from = "https://mysource.com/post/1";

  it("returns distinct external hosts, deduped per page", () => {
    const html = `
      <a href="https://a.com/x">a</a>
      <a href="https://a.com/y">a again</a>
      <a href='https://b.org/z'>b</a>
      <a href=https://c.io>c bare</a>
    `;
    expect(extractOutboundHosts(html, from).sort()).toEqual(["a.com", "b.org", "c.io"]);
  });

  it("excludes links back to the page's own site (incl. subdomains)", () => {
    const html = `
      <a href="/relative">rel</a>
      <a href="https://mysource.com/other">self</a>
      <a href="https://blog.mysource.com/x">self subdomain</a>
      <a href="https://external.com/x">ext</a>
    `;
    expect(extractOutboundHosts(html, from)).toEqual(["external.com"]);
  });

  it("drops non-http(s) and private/loopback hosts (SSRF guard)", () => {
    const html = `
      <a href="javascript:alert(1)">xss</a>
      <a href="mailto:a@b.com">mail</a>
      <a href="http://127.0.0.1/admin">loopback</a>
      <a href="http://192.168.1.1/">lan</a>
      <a href="http://169.254.169.254/latest/meta-data/">imds</a>
      <a href="https://good.com/x">ok</a>
    `;
    expect(extractOutboundHosts(html, from)).toEqual(["good.com"]);
  });

  it("normalizes www and drops known-noise hosts", () => {
    const html = `
      <a href="https://www.keep.com/x">keep</a>
      <a href="https://fonts.googleapis.com/css">font</a>
      <a href="https://twitter.com/intent/tweet">share</a>
      <a href="https://schema.org/Article">schema</a>
    `;
    // twitter.com is not in STOP_HOSTS (kept as a real signal); the rest are noise.
    expect(extractOutboundHosts(html, from).sort()).toEqual(["keep.com", "twitter.com"]);
  });

  it("returns [] for an unparseable fromUrl", () => {
    expect(extractOutboundHosts(`<a href="https://a.com">a</a>`, "not a url")).toEqual([]);
  });
});
