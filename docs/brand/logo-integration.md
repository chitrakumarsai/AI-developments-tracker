# Brand & Logo Integration — Ideas

> Source asset: [`docs/brand/logo-full.png`](./logo-full.png) (also served at `web/public/brand/logo-full.png`).
> Status: **ideas + Slice 1 plan** — nothing implemented yet.

## The mark

A lowercase **`a`** bowl (an open ring) flowing into an **`i`** stem, with the `i`'s
dot rendered as a separate gradient **orb**. Wordmark reads **"the ai chronicles"** —
`the` and `chronicles` in deep navy, `ai` in the blue→teal gradient. Tagline:
**TRACK. BUILD. EVOLVE.** in muted slate, flanked by short gradient rules.

### Palette (pulled from the mark)

| Token | Approx value | Where it lives in the logo |
|---|---|---|
| Deep navy | `~oklch(20% 0.04 260)` | `the` / `chronicles` text, upper ring, `i` stem |
| Brand blue | `~oklch(60% 0.17 250)` | mid-gradient of the bowl, top of the orb |
| Brand teal | `~oklch(72% 0.13 175)` | bottom of the bowl, `ai` end, bottom of the orb |
| Slate | `~oklch(55% 0.02 250)` | tagline text |

Gradient direction: navy (top-left) → blue → teal (bottom-right), ~100°.

## Decisions locked (2026-07-11)

1. **Name stays "The AI Chronicles"** — canonical in code + domain (`theaichronicles.ai`).
   The corrected logo now spells "chronicles" (plural), so there is no longer any
   conflict. No rename sweep needed.
2. **Blue→teal reaches the AI-gradient only.** The existing indigo UI accent, links,
   and active states stay exactly as tuned (contrast/a11y already verified). Only the
   "AI provenance" shimmer adopts the brand gradient.
3. **Use the official artwork, not a recreation.** An SVG rebuild kept missing the
   mark's proportions, so the "ai" monogram is cropped from the vendor PNG with the
   background keyed out to transparency → `public/brand/logo-mark.png` (header) and
   `app/icon.png` (favicon). Source of truth: [`logo-full.png`](./logo-full.png).
4. **Header = monogram + canonical text** (not the literal logo wordmark), so the name
   shown always matches the product name and domain.

## Where the logo earns its place

1. **Favicon + app icon** — the monogram alone. Biggest immediate win: the app has
   **no favicon today** (`app/icon.*` doesn't exist). → `app/icon.svg`, `apple-icon`,
   PWA manifest entries.
2. **Header lockup** — replace the bare Fraunces `AI Chronicles` text with the SVG
   monogram + "The AI Chronicles"; keep the "Find the signal in AI" tagline.
3. **The tie-in worth doing:** the logo's blue→teal gradient *becomes* the shimmer that
   already marks LLM surfaces (Ask tab, digests, reranked saved views). Brand identity
   and "this is AI" become one visual language.
4. **Sign-in hero** — swap the `✦ The AI Chronicles` placeholder for the real mark,
   scaled up, above the sign-in copy.
5. **OG / social share card** — rebuild `app/opengraph-image.tsx` around the monogram +
   gradient instead of plain text.
6. **Loading / empty states** — the gradient orb (the `i` dot) as a subtle, reduced-
   motion-aware pulse while the feed streams.

## Proposed slicing

### Slice 1 — Favicon + header mark (highest visibility) — SHIPPED
- `components/brand/Logo.tsx` — `LogoMark`, renders the extracted `logo-mark.png`
  at a fixed 578×540 aspect (caller passes height only → no layout shift).
- `app/icon.png` — square favicon cropped from the artwork (the app had none before).
- Header in `app/feed/page.tsx`: `<LogoMark size={40} />` beside the "AI Chronicles"
  wordmark + tagline.
- `globals.css`: `--color-ai-from` / `--color-ai-to` (light **and** `.dark`) retuned to
  the brand blue→teal so the AI shimmer carries the brand gradient. No accent/link changes.
- Verified in the running app (light); build green. Dark-mode legibility of the navy
  parts is a known limitation, moot until a dark-mode toggle ships.

### Slice 2 — Sign-in hero, OG card, loading orb
- Sign-in brand swap, OG image rebuild, loading-state orb. Deferred until Slice 1 ships.

## Open sub-decision

- Header: **mark + text** (recommended) vs **mark only**.

## Guardrails

- Recreated SVG must be **matched closely and shown for approval** before it's wired
  everywhere — no silent divergence from the vendor mark.
- Only `--color-ai-*` changes in `globals.css`; the indigo accent system is out of scope
  for this work.
