import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, STATIC_SECURITY_HEADERS } from "./headers";

describe("buildContentSecurityPolicy", () => {
  const nonce = "abc123==";

  it("includes the nonce and strict-dynamic in script-src", () => {
    const csp = buildContentSecurityPolicy(nonce);
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
  });

  it("does not allow unsafe-inline scripts", () => {
    const csp = buildContentSecurityPolicy(nonce);
    // The script-src directive must never contain unsafe-inline.
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("allows styles via 'unsafe-inline' without a nonce (WebKit stylesheet fix)", () => {
    // A nonce in style-src makes browsers ignore 'unsafe-inline' and WebKit then
    // refuses Next's nonced <link> stylesheet. style-src must stay nonce-free.
    const csp = buildContentSecurityPolicy(nonce);
    const styleSrc = csp.split(";").find((d) => d.trim().startsWith("style-src"));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'unsafe-inline'");
    expect(styleSrc).not.toContain("nonce-");
  });

  it("adds unsafe-eval only in dev", () => {
    expect(buildContentSecurityPolicy(nonce, { isDev: true })).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(nonce, { isDev: false })).not.toContain("'unsafe-eval'");
  });

  it("allows the Supabase origin over https and wss in connect-src", () => {
    const csp = buildContentSecurityPolicy(nonce, {
      supabaseUrl: "https://proj.supabase.co",
    });
    const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src"))!;
    expect(connect).toContain("https://proj.supabase.co");
    expect(connect).toContain("wss://proj.supabase.co");
  });

  it("derives ws:// for a local http Supabase url", () => {
    const csp = buildContentSecurityPolicy(nonce, {
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src"))!;
    expect(connect).toContain("http://127.0.0.1:54321");
    expect(connect).toContain("ws://127.0.0.1:54321");
  });

  it("explicitly locks framing/worker/manifest instead of relying on default-src", () => {
    const csp = buildContentSecurityPolicy(nonce);
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
  });

  it("omits Supabase origins when no url is provided", () => {
    const csp = buildContentSecurityPolicy(nonce);
    const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src"))!;
    expect(connect.trim()).toBe("connect-src 'self'");
  });

  it("locks down framing, base-uri and objects", () => {
    const csp = buildContentSecurityPolicy(nonce);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("upgrades insecure requests only in production", () => {
    // In dev the app is served over http://localhost; Safari upgrades those to
    // https and fails the TLS handshake, so the directive must be prod-only.
    expect(buildContentSecurityPolicy(nonce, { isDev: false })).toContain(
      "upgrade-insecure-requests",
    );
    expect(buildContentSecurityPolicy(nonce, { isDev: true })).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("ships the expected static header set", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual([
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
    ]);
  });
});
