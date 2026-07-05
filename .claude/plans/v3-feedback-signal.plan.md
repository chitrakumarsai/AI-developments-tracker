# app-feedback-v3 — cut the noise, surface the signal

**Source:** `.claude/prds/backlog/app-feedback-v3.md`
**Branch:** `feat/feedback-v3-signal` (off `main`, post-Phase-1).
**Preference-checkpoint (2026-07-04):** user selected all four clusters + a server-side
`app_settings` table for persistence. Built as four thin, independently-committable slices.

## What's already satisfied (verified in code — not rebuilt)
- **Original publish date:** ItemCard renders `published_at` (true publish date) + relative age;
  no connector substitutes fetch time. Feedback #1 already correct. (Any wrong date = a per-source
  parse bug, out of scope here.)
- **Click a tag/source to filter:** shipped in 1.5 (ItemCard source badge + tag chips are filter
  links; ActiveFilters pill). Feedback #12 done.
- **Time-window picker:** Today/Week/Month/All already on the feed. Feedback #11 done.
- **Reddit/HN already capture upvotes** into `items.metric` and comments into the summary text —
  so "see upvotes without opening" is a *labeling* fix, not new data (#2, #9).

---

## Slice A — Engagement badges (display only, no schema) ✅ smallest, ship first
Per-platform metric badge instead of the one-size "★ … likes":
- `metricMeta(platformSlug, category)` → `{ icon, label }`:
  github → `★ stars` · hugging-face/models → `♥ likes` · reddit → `▲ upvotes` ·
  hacker-news → `▲ points` · default → `★`.
- ItemCard uses it (aria-label + visible). Comments already surface in the summary line.
- **TDD:** unit tests for `metricMeta` mapping. **Acceptance:** a Reddit card shows "▲ N upvotes",
  a repo shows "★ N stars", a model "♥ N likes".

## Slice B — Settings table + daily per-source cap (the core de-crowder)
- **Migration** `app_settings` (single-row singleton): `id smallint pk default 1 check (id=1)`,
  `top_per_source_day int` (default 10, null = unlimited), `include_keywords text[] default '{}'`,
  `exclude_keywords text[] default '{}'`, `min_metric int` (nullable), `updated_at timestamptz`.
  (All columns created now; keyword/metric ones consumed in Slice C.)
- **`lib/settings/persist.ts`** (server-only, injectable client): `getSettings()` → row or typed
  defaults; `saveSettings(input)` upserts the singleton. Zod-validated at the route.
- **Cap in `getFeedItems`:** new optional `perSourceDailyCap`. After the result list is built
  (relevance ranks in JS already; recent/metric fetch a pool), keep at most N items per
  `(source_id, published_at day)` group, preserving order, then apply `limit`. Directly cuts
  arXiv/Reddit flooding (#3, #6, #7, #8).
- **`/settings` page** + `SettingsForm` island: number input "Top per source/day" + **Save**
  (POST `/api/settings`). Linked from header.
- `app/page.tsx` loads settings server-side (try/catch → defaults) and passes the cap into the feed.
- **TDD:** `persist.test.ts` (defaults, upsert, error), `queries.test.ts` (cap keeps ≤N per
  source/day, respects order). **Acceptance:** set cap=5 → no source shows >5/day; Save persists.

## Slice C — Settings filters: keywords + metric range (built on Slice B)
- Extend `/settings`: include-keywords, exclude-keywords (comma lists), min-metric slider.
- Apply in `getFeedItems`: `min_metric` (drop items with metric below threshold — items with no
  metric kept unless a "require metric" toggle; keep simple: null metric passes); include = keep
  items whose title/summary/tags match ANY include kw; exclude = drop items matching ANY exclude
  kw. Applied server-side via `.or(...ilike...)`/`.gte("metric")` where clean, else in the JS pool
  step (sanitized, reuse `sanitizeSearch`).
- **TDD:** query tests for include/exclude/min-metric. **Acceptance:** exclude "crypto" hides those;
  min-metric slider raises the floor; Save persists and the feed reflects it.

## Slice D — LLM weekly/monthly digest (OpenAI; confirm cost at build)
- **`lib/llm/digest.ts`:** given the top-ranked items for a period (week/month), produce a concise
  "what happened" summary via `gpt-4o-mini` (bulk model). **Budget-aware + cached** (a `digests`
  table keyed by `period` + a hash of the item-id set → reused until the set changes), and
  **treat item text as untrusted** — wrap/label external content, never let it act as instructions
  (§12.7 prompt-injection guard). Fails soft: no digest ≠ broken feed.
- **`DigestCard`** at the top of the feed (collapsible), server-rendered for the active window.
  Only shows for week/month windows.
- **TDD:** unit tests with an injected fake OpenAI client (deterministic), cache hit/miss, untrusted
  wrapping. **Acceptance:** feed top shows a 3–5 bullet digest for the week; second load hits cache.
- **Cost note:** one `gpt-4o-mini` call per period per item-set change (cached). Expected pennies/day.
  Confirmed before wiring the real client.

---

## Sequencing & gates
Order A → B → C → D (each standalone-valuable, independently committable). Each slice: TDD →
tsc/eslint → live smoke where a DB/LLM path is touched → **GATE 2 diff** → conventional commit.
Anything touching the settings table / feed query gets an inline security pass (untrusted input,
service-role only). Slice D (LLM + new table) is the only one that may warrant a `security-reviewer`
sub-agent pass for prompt-injection.

## Data-model note (Phase-2 ready)
`app_settings` is a single global row now (no auth). Phase 2 adds `user_id` + RLS to make it
per-user — same columns, so no rework of the shape.

## Out of scope (documented)
- True external "arXiv traction" signal (citations/mentions) — approximated here by the per-source
  cap + keyword/metric filters; a real traction feed is a later connector.
- A separate structured Reddit *comments* count column (comments stay in the summary text for now).
