import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // Static security headers on every route (2.3 hardening). The per-request
  // Content-Security-Policy is set in middleware.ts because it carries a nonce.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...STATIC_SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
