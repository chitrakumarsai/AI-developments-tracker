import { describe, expect, it } from "vitest";

import { unsafeUrlReason, ipIsPrivate, fetchFollowingSafeRedirects, readTextCapped, createSafeLookup } from "./net";

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

/**
 * DNS rebinding: `unsafeUrlReason` only inspects the hostname string, so a
 * public-looking host that resolves to 127.0.0.1 slips through. The socket-level
 * lookup is the only place that can see the real address.
 */
describe("createSafeLookup (DNS-rebinding guard)", () => {
  type Addr = { address: string; family: number };
  type Cb = (err: Error | null, address?: unknown, family?: number) => void;
  type Resolver = (hostname: string, options: unknown, cb: Cb) => void;

  const resolver =
    (addresses: Addr[]): Resolver =>
    (_hostname, _options, cb) =>
      cb(null, addresses);

  function run(addresses: Addr[], options: object = {}) {
    return new Promise<{ err: Error | null; result: unknown }>((resolve) => {
      const lookup = createSafeLookup(resolver(addresses) as never) as unknown as Resolver;
      lookup("host.test", options, (err, a) => resolve({ err, result: a }));
    });
  }

  it("blocks a public hostname that resolves to loopback", async () => {
    const { err } = await run([{ address: "127.0.0.1", family: 4 }]);
    expect(err?.message).toMatch(/127\.0\.0\.1/);
  });

  it("blocks the cloud metadata address", async () => {
    const { err } = await run([{ address: "169.254.169.254", family: 4 }]);
    expect(err).toBeTruthy();
  });

  it("blocks private RFC1918 ranges", async () => {
    for (const ip of ["10.0.0.5", "192.168.1.1", "172.16.0.9"]) {
      const { err } = await run([{ address: ip, family: 4 }]);
      expect(err, ip).toBeTruthy();
    }
  });

  it("blocks IPv6 loopback and unique-local", async () => {
    for (const ip of ["::1", "fd00::1", "fe80::1"]) {
      const { err } = await run([{ address: ip, family: 6 }]);
      expect(err, ip).toBeTruthy();
    }
  });

  it("blocks when ANY resolved address is private (round-robin rebinding)", async () => {
    // A rebinding host can return one public and one private A record; taking
    // the first would be a coin flip.
    const { err } = await run([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(err?.message).toMatch(/127\.0\.0\.1/);
  });

  it("allows a genuinely public address, preserving the callback shape", async () => {
    const { err, result } = await run([{ address: "93.184.216.34", family: 4 }]);
    expect(err).toBeNull();
    expect(result).toBe("93.184.216.34"); // non-`all` callers get a bare address
  });

  it("preserves the `all: true` array shape undici uses", async () => {
    const addresses = [{ address: "93.184.216.34", family: 4 }];
    const { err, result } = await run(addresses, { all: true });
    expect(err).toBeNull();
    expect(result).toEqual(addresses);
  });

  it("propagates a resolver error rather than failing open", async () => {
    const failing: Resolver = (_h, _o, cb) => cb(new Error("ENOTFOUND"));
    const lookup = createSafeLookup(failing as never) as unknown as Resolver;
    const err = await new Promise<Error | null>((resolve) =>
      lookup("host.test", {}, (e) => resolve(e)),
    );
    expect(err?.message).toMatch(/ENOTFOUND/);
  });
});

/**
 * IPv6 and edge-form coverage. Each of these was a real gap in the original
 * regex-based check: `::ffff:7f00:1` and `64:ff9b::7f00:1` both reach 127.0.0.1.
 */
describe("ipIsPrivate — exhaustive address forms", () => {
  const BLOCKED = [
    ["127.0.0.1", "IPv4 loopback"],
    ["127.1.2.3", "IPv4 loopback range"],
    ["10.0.0.1", "RFC1918"],
    ["172.16.0.1", "RFC1918"],
    ["172.31.255.255", "RFC1918 upper"],
    ["192.168.1.1", "RFC1918"],
    ["169.254.169.254", "cloud metadata"],
    ["0.0.0.0", "unspecified v4"],
    ["0.1.2.3", "0.0.0.0/8"],
    ["100.64.0.1", "CGNAT 100.64/10"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmark 198.18/15"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["0:0:0:0:0:0:0:1", "IPv6 loopback, expanded"],
    ["::", "IPv6 unspecified"],
    ["0:0:0:0:0:0:0:0", "IPv6 unspecified, expanded"],
    ["::ffff:127.0.0.1", "v4-mapped loopback, dotted"],
    ["::ffff:7f00:1", "v4-mapped loopback, hex"],
    ["::ffff:a00:1", "v4-mapped 10.0.0.1, hex"],
    ["64:ff9b::7f00:1", "NAT64 loopback, hex"],
    ["64:ff9b::127.0.0.1", "NAT64 loopback, dotted"],
    ["64:ff9b::a9fe:a9fe", "NAT64 cloud metadata"],
    ["fc00::1", "unique-local fc00::/7"],
    ["fd12:3456::1", "unique-local fd"],
    ["fe80::1", "link-local fe80::/10"],
    ["febf::1", "link-local upper"],
    ["ff02::1", "IPv6 multicast"],
    ["FE80::1", "uppercase link-local"],
  ] as const;

  const ALLOWED = [
    ["8.8.8.8", "public DNS"],
    ["93.184.216.34", "example.com"],
    ["1.1.1.1", "public"],
    ["172.32.0.1", "just outside RFC1918"],
    ["172.15.0.1", "just below RFC1918"],
    ["100.63.255.255", "just below CGNAT"],
    ["100.128.0.1", "just above CGNAT"],
    ["2606:4700::1111", "public IPv6"],
    ["2001:4860:4860::8888", "public IPv6"],
    ["::ffff:8.8.8.8", "v4-mapped public"],
    ["64:ff9b::8.8.8.8", "NAT64 public"],
    ["fb00::1", "just below fc00::/7"],
    ["fe7f::1", "just below fe80::/10"],
    ["fec0::1", "just above fe80::/10 (site-local, deprecated)"],
  ] as const;

  it.each(BLOCKED)("blocks %s (%s)", (ip) => {
    expect(ipIsPrivate(ip)).toBe(true);
  });

  it.each(ALLOWED)("allows %s (%s)", (ip) => {
    expect(ipIsPrivate(ip)).toBe(false);
  });

  it("still recognises the hostname forms the URL guard relies on", () => {
    expect(ipIsPrivate("localhost")).toBe(true);
    expect(ipIsPrivate("printer.local")).toBe(true);
    expect(ipIsPrivate("example.com")).toBe(false);
  });

  it("does not crash on garbage", () => {
    for (const junk of ["", "not-an-ip", ":::", "999.999.999.999", "::ffff:zz"]) {
      expect(() => ipIsPrivate(junk)).not.toThrow();
    }
  });
});

describe("unsafeUrlReason — IP literals in the URL", () => {
  // undici performs NO DNS lookup for an IP literal, so the rebinding guard
  // never sees these. They must be refused here or not at all.
  it.each([
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://127.0.0.1/",
    "http://100.64.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
  ])("blocks %s", (url) => {
    expect(unsafeUrlReason(url)).not.toBeNull();
  });

  it.each([
    "https://example.com/feed",
    "https://[2606:4700::1111]/",
    "https://8.8.8.8/",
  ])("allows %s", (url) => {
    expect(unsafeUrlReason(url)).toBeNull();
  });
});
