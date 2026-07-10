# v5 — UI refresh (feedback-v5.md)

Two slices, per the preference checkpoint. Slice 1 is the concrete UX fixes;
Slice 2 is the design-system rebuild. Each ships as its own PR.

## Recorded preferences (§12.4)

| Decision | Choice |
| --- | --- |
| Design direction | Refine the existing Editorial/Swiss direction — keep Inter + Fraunces, rebuild the palette (cooler neutral ramp + semantic accent), soften radii, add layered surfaces, intentional spacing rhythm, designed interaction states |
| Products tab name | **Ask** |
| Ask contents | Prompt-views only, no sub-tabs. `Products & Tools` content moves to the **More** catch-all |
| Dark mode | Light-only for now; keep `.dark` tokens in sync so a toggle is a later slice |
| Scope | Two slices |

## Hard constraints discovered

- `slug: "products"` is **persisted** in `saved_views.filters.section` and lives in
  shared URLs. The new Ask tab takes slug `ask`; the legacy `products` slug must keep
  resolving — it aliases to **More**, where its content now lives.
- `CURATED_PLATFORMS` is currently derived from `HOST_MAP`, which also drives item
  label resolution. Dropping Reddit from the picker requires **decoupling** the two,
  or Reddit items lose their platform chip.
- `lib/ingestion/api/reddit.ts` has its own host registry. Untouched by any of this.
- `MORE_CATEGORIES` is derived as `SOURCE_CATEGORIES − DEDICATED_CATEGORIES`, so
  removing `"Products & Tools"` from the dedicated list moves it into More
  automatically. No new list to maintain.

---

## Slice 1 — UX fixes

**Goal:** the four concrete asks in feedback-v5.md, no visual-system change.

### 1.1 Drop Reddit from the Platform picker
- `lib/feed/platform.ts`: declare `CURATED_PLATFORMS` explicitly (GitHub, Hugging
  Face, Hacker News, arXiv) instead of mapping over `HOST_MAP`. `HOST_MAP` keeps its
  reddit entry so Reddit items still render a "Reddit" chip and stay reachable via
  the source filter.
- Test: a reddit URL still resolves to the Reddit platform; `isCuratedPlatform("reddit")`
  is now false, so `?platform=reddit` is rejected as hostile input.

### 1.2 Products → Ask
- `lib/feed/categories.ts`:
  - Remove `"Products & Tools"` from `DEDICATED_CATEGORIES` (it flows into `MORE_CATEGORIES`).
  - Replace the products section with `{ slug: "ask", label: "Ask", category: null }`,
    flagged `isPrompt: true`.
  - `sectionForSlug("products")` → the More section (legacy alias).
- Tests: alias resolves to More; `MORE_CATEGORIES` now contains `"Products & Tools"`;
  Ask carries no category.

### 1.3 Ask = prompt-views only
- `app/feed/page.tsx`: when the Ask tab is active, render `<MyViews />` directly —
  drop the `view=mine` sub-tab nav, the search form, and the filter bar (none of them
  apply to a prompt surface). Keep `?id=` for view detail.
- `MyViews` / `CreateViewForm` / `ViewActions` / `ItemCard`: `section: "products"` →
  `"ask"`; drop the `&view=mine` suffix from `MY_VIEWS_BASE`.
- Give the prompt box a leading, inviting empty state so the tab explains itself.

### 1.4 Make Window / Source prominent
- The labels ("Window", "Sort", "Source") are `text-faint` and the controls are
  near-identical pills — that's the "not highlighted" complaint. Group them into one
  filter bar with legible labels and a segmented-control treatment where the active
  option is unambiguous.

**Verify:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint`, `npm run build` — all
from `web/` with the Node 20 PATH. Then drive the app and check the four fixes.

---

## Slice 2 — Design system

- `app/globals.css`: rebuild the palette on a real neutral ramp + semantic accent;
  radii 2px → 8/12px; add elevation tokens; keep `.dark` in sync.
- Re-layout `app/feed/page.tsx`, `app/sources/page.tsx`, `app/settings/page.tsx`
  with intentional spacing rhythm, layered surfaces, and designed hover/focus/active
  states. Anti-template policy (§9) applies.
- Mobile-first: verify 320 / 375 / 768 / 1024 / 1440.

---

## Gates

- **GATE 1** — this plan approved before any implementation code.
- **GATE 2** — diff + review presented before commit/push, per slice.
