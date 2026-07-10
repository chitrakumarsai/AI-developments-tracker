import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

// Branded share card for the landing (2.4). Only trusted brand strings are
// rendered — never ingested content — so there is no injection surface.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand palette lifted from the logo.
const INK = "#0d1b2e";
const PAPER = "#f8fafc";
const BLUE = "#1f83e6";
const TEAL = "#22c3a1";
const MUTED = "#5a6b7a";

export default function OpengraphImage() {
  // Read from the public dir at prerender time and embed as a data URI, so the
  // card needs no network fetch. This route prerenders, so cwd is the app root.
  const markSrc = `data:image/png;base64,${readFileSync(
    join(process.cwd(), "public", "brand", "logo-mark.png"),
  ).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={104} height={97} alt="" />
          <span style={{ fontSize: 34, fontWeight: 600, color: INK }}>
            {SITE_NAME}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              color: INK,
              letterSpacing: "-0.02em",
              maxWidth: 960,
            }}
          >
            The one thing in AI worth reading right now.
          </div>
          <div style={{ marginTop: 28, fontSize: 34, color: MUTED }}>
            {SITE_TAGLINE}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 120,
              height: 8,
              borderRadius: 9999,
              background: `linear-gradient(90deg, ${BLUE}, ${TEAL})`,
            }}
          />
          <span
            style={{
              fontSize: 26,
              color: TEAL,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            theaichronicles.ai
          </span>
        </div>
      </div>
    ),
    size,
  );
}
