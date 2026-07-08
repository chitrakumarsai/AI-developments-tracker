import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

// Branded share card for the landing (2.4). Only trusted brand strings are
// rendered — never ingested content — so there is no injection surface.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#141414";
const PAPER = "#f7f4ee";
const ACCENT = "#c2410c";
const MUTED = "#6b6b6b";

export default function OpengraphImage() {
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 34,
            fontWeight: 600,
            color: INK,
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: ACCENT,
              marginRight: 16,
            }}
          />
          {SITE_NAME}
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

        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: ACCENT,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          theaichronicles.ai
        </div>
      </div>
    ),
    size,
  );
}
