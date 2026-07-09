# Slice A — Feed Findability (v4 feedback #1 + #2)

**Branch:** `feat/v4.1-feed-findability` (off `main`)
**Tier:** standard · TDD · two gates
**Preferences (locked 2026-07-09):** catch-all "More" tab; home-page source-picker dropdown.

## Problem
1. **#2 — "which tab is my feed under?"** Source categories (11) exceed feed tabs (6). Five categories (Newsletters & Blogs, Video & Podcasts, Conferences, Datasets & Benchmarks, Funding & Industry) have no tab, so their items only appear under "All", buried by date.
2. **#1 — "find the feed I just added."** No way to jump to a specific source from the home page; user must scroll or visit /sources.

## Part 1 — "More" catch-all tab
- `lib/feed/categories.ts`: add `categories?: readonly string[]` to `FeedSection`. Derive `MORE_CATEGORIES = SOURCE_CATEGORIES − tab-backed categories` (import from `lib/sources/categories.ts`; no hardcoding). Add `{ slug: "more", label: "More", category: null, categories: MORE_CATEGORIES }` to `FEED_SECTIONS`.
- `lib/feed/queries.ts` `FeedQuery` + `getFeedItems`: accept `categories?: readonly string[]`; when present apply `.in("category", categories)`; else keep `.eq("category", category)`. `categories` wins over `category`.
- `components/feed/FeedList.tsx`: thread `categories` prop → `getFeedItems`.
- `app/feed/page.tsx`: pass `active.categories` (and existing `active.category`) to `FeedList`. Empty-state copy already generic.

**Tests (RED→GREEN):**
- `categories.test.ts`: MORE_CATEGORIES = exactly the 5 orphans; no overlap with dedicated tabs; every SOURCE_CATEGORY reachable by some tab.
- `queries.test.ts`: `getFeedItems({ categories: [...] })` calls `.in("category", …)`; `category` still `.eq`.

## Part 2 — Home source-picker dropdown
- Query: list active sources `(id, name)` sorted by name (reuse/extend existing sources query; `status='active'`).
- `components/feed/SourcePicker.tsx` (client): `<select>` of sources + "All sources"; on change `router.push(feedHref({ ...current, source: id || null, window: id ? "all" : window }))`. Picking a source forces `window=all` (fresh source's older items show); "All sources" clears source + restores window. Full-width, min-h-44 (mobile touch target).
- `app/feed/page.tsx`: fetch sources server-side, render `<SourcePicker>` in the controls row. DB hiccup → empty list, picker hidden (feed never breaks).
- Active source already labeled/cleared by `ActiveFilters` (PR #16) — no change.

**Tests:**
- `SourcePicker.test.tsx`: renders options; selecting a source navigates with `source` + `window=all`; "All sources" clears source.

## Out of scope
- Slice B (NL Products) — separate slice, blocked on OpenAI quota.
- Re-categorizing already-ingested mis-filed items (the "More" tab surfaces them as-is).

## Gates
- **GATE 1:** this plan (awaiting approval).
- **GATE 2:** diff + `code-review` (+ react-reviewer) before commit/PR.

## Verify
- Add an RSS source categorized "Newsletters & Blogs" → its items appear under **More**.
- Home source picker → select it → feed shows only that source, all-time; pill clears it.
- Responsive check 320/375/768/1024/1440, no overflow.
