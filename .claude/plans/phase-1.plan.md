# Phase 1 — Implementation Plan (task-level)

Detailed task breakdown for Phase 1. Master view: [`ROADMAP.md`](../../ROADMAP.md). Spec: [`CLAUDE.md`](../../CLAUDE.md).

**Every subphase below:** starts with a `preference-checkpoint`, runs through `/plan-prd → /plan → tdd-workflow → /code-review → /pr`, and passes **GATE 1** (plan approved) and **GATE 2** (pre-commit). Tasks are TDD where code is involved (red → green → refactor, 80%+ coverage).

---

## Subphase 1.0 — Planning & Scaffold

**Objective:** approved planning docs + a running, wired-but-empty skeleton.

### Tasks
1. **Preference-checkpoint** — confirm: product name (or defer), monorepo layout, fate of root `main.py` (→ `worker/` or retire), Tailwind design-token starting palette/typography.
2. **Scaffold Next.js** — App Router + TypeScript + Tailwind; base layout; `styles/tokens.css` (palette, typography, spacing, motion tokens).
3. **Supabase setup** — `supabase init`; local stack (`supabase start`); typed client in `lib/supabase/`; `.env.example` (Supabase URL/anon/service-role, `OPENAI_API_KEY`).
4. **First migration** — create core tables: `sources`, `items`, `feedback`, `source_candidates`, `saved_views` (schema per CLAUDE.md §11). Add indexes (`items.url` unique for dedupe, `items.published_at`, `items.source_id`).
5. **Repo hygiene** — ESLint + Prettier; Playwright + test runner; minimal CI (lint + test) ; `.gitignore` for `.env`; decide/retire `main.py`.
6. **Seed** — `supabase/seed.sql` with one arXiv source row (`status='active'`) ready for 1.1.

### Acceptance criteria
- `supabase start` + `npm run dev` boot a blank app that connects to local Supabase.
- Migration applies cleanly; tables + indexes exist; types generate (`supabase gen types`).
- CI green on lint + a placeholder test.
- Planning docs (this plan + ROADMAP) approved.

### Skills / agents
`architect` (data model), `database-reviewer` (schema/indexes), `postgres-patterns`, `database-migrations`, `frontend-design-direction` (tokens).

**GATE 1:** approve schema + scaffold plan. **GATE 2:** approve scaffold commit.

---

## Subphase 1.1 — First Vertical Slice (arXiv)

**Objective:** real arXiv content end-to-end on a mobile-first feed. This connector is the **reusable template**.

### Slice = fetch → parse → dedupe → store → API → display

### Tasks
1. **Preference-checkpoint** — confirm arXiv categories (e.g., cs.AI, cs.LG, cs.CL), how many items per fetch, feed card layout direction.
2. **Define the connector contract** — `lib/ingestion/types.ts`: a connector takes a `Source`, returns normalized `Item[]` (`title, author, url, summary, published_at, category, tags`). Link-first (no full body).
3. **arXiv RSS connector** (`lib/ingestion/rss/arxiv.ts`) — fetch via `undici`, parse with `rss-parser`, map to `Item[]`, **sanitize** all fields (untrusted input). *(TDD: test against a saved arXiv feed fixture.)*
4. **Dedup + persist** — upsert into `items` on unique `url`; update `sources.last_fetched`. *(TDD: re-running the same feed creates no duplicates.)*
5. **Manual ingest trigger** — a route handler `POST /api/ingest/run?source=arxiv` to run the connector on demand (cron comes in 1.3).
6. **Feed API** — `GET /api/items` returns recent items (paginated, newest first). *(TDD.)*
7. **Mobile-first feed UI** — `components/feed/` item cards (title, source, date, summary snippet, external link); responsive at 320/375/768; touch-friendly tap targets.
8. **E2E** — load feed on a mobile viewport, assert arXiv items render and links point to arxiv.org.

### Acceptance criteria
- Running the ingest trigger populates `items` from real arXiv data.
- The feed shows those items on a phone viewport; tapping opens the original at arxiv.org.
- Re-running ingest does not duplicate items.
- Connector + dedup + feed API have unit tests; one E2E passes; coverage ≥ 80% on new code.

### Skills / agents
`ingestion-connector`, `react-patterns`, `frontend-patterns`, `react-test`, `e2e-runner`, `react-reviewer`, `code-reviewer`.

**GATE 1 / GATE 2** as standard. Tag the connector + feed as the template for 1.2.

---

## Subphase 1.2 — More Sources

**Objective:** aggregation across all core categories; the catalog table drives what runs.

### Tasks (one connector slice at a time, each copying the 1.1 template)
1. **Preference-checkpoint** — confirm connector order and which need API keys.
2. **Catalog-driven runner** — generalize the ingest trigger to loop over `active` sources by `ingestion_type`, dispatching to the right connector.
3. **GitHub trending** connector (API/token or light scrape). *(TDD.)*
4. **Hugging Face** connector (official API — models + papers). *(TDD.)*
5. **Company blogs** connector (generic RSS — reuse arXiv RSS base). *(TDD.)*
6. **Hacker News** connector (Algolia HN API, AI stories). *(TDD.)*
7. **Reddit** connector (subreddit RSS/API, filtered). *(TDD.)*
8. **Newsletters / YouTube** connectors (RSS). *(TDD.)*
9. **Secondary / aggregator sources (link-first)** — onboard *curator* feeds that surface others' content (Hugging Face Papers, Papers with Code, newsletters, Reddit roundups) as ordinary RSS/API sources whose `items` link to the original paper/post/tweet. Capture original-source attribution where the feed provides it. *(TDD.)*
10. **X / LinkedIn** — no direct connector in Phase 1; surface them *via* the secondary/aggregator sources above + manual entry; respect ToS. A direct connector is added only if a compliant API path appears. (Finding new accounts/lists to follow is handled in 1.6.)
11. **Category surfacing** — items carry `category`; feed shows a mix; basic category chips (full filtering in 1.5).

### Acceptance criteria
- Feed mixes items across multiple categories, all driven by the `sources` table (zero hardcoded sources).
- Each connector has tests and sanitizes untrusted content.
- A new source can be added by inserting a catalog row (no code change for RSS-type sources).

### Skills / agents
`ingestion-connector`, `source-onboard`, `python-reviewer` (if a connector goes in `worker/`), `security-reviewer` (scraping connectors), `code-reviewer`.

---

## Subphase 1.3 — Scheduled Refresh

**Objective:** content stays current automatically.

### Tasks
1. **Preference-checkpoint** — confirm cadence (daily vs every 2 days) and any per-source overrides.
2. **Cron route** — `GET /api/cron/refresh` runs all `active` sources due per `refresh_interval`; idempotent + dedup-safe.
3. **Vercel Cron config** — schedule in `vercel.json`; secure the route (cron secret header).
4. **Per-source resilience** — one failing source logs + continues; record `last_fetched` and error state. *(TDD.)*
5. **Observability** — minimal run log (items added per source, failures).

### Acceptance criteria
- Content updates on schedule with no manual action.
- A deliberately broken source does not abort the whole run; its failure is logged.
- Cron endpoint rejects unauthenticated calls.

### Skills / agents
`architect`, `deployment-patterns`, `security-reviewer` (cron auth), `code-reviewer`.

---

## Subphase 1.4 — Feedback Loop

**Objective:** the feed adapts to the user's taste.

### Tasks
1. **Preference-checkpoint** — confirm: thumbs UI placement; whether LLM relevance scoring is on by default; demote-vs-hide for thumbs-down.
2. **Feedback capture** — thumbs up/down on item cards → `feedback` table; optimistic UI with rollback. *(TDD.)*
3. **Ranking v1** (`lib/ranking/`) — score = recency + source weight + feedback signal. *(TDD with fixture items.)*
4. **`item-summarize`** — Claude pipeline: short summary + relevance score for new/long-listed items; Haiku for bulk; **cache** results; treat item text as untrusted (no injection). *(TDD with mocked LLM.)*
5. **Source re-weighting** — aggregate feedback nudges `sources.priority`/`weight` over time. *(TDD.)*
6. **Wire ranking into the feed API** — default sort by relevance.

### Acceptance criteria
- Thumbs-down items are demoted/hidden; liked patterns surface higher.
- Sources re-weight from aggregate feedback.
- LLM calls are cached and budget-bounded; ranking + summarize have tests (LLM mocked).

### Skills / agents
`feed-rank`, `item-summarize`, `react-test`, `python-testing` (if worker), `code-reviewer`, `security-reviewer` (prompt-injection surface).

---

## Subphase 1.5 — Filters + UI/UX Polish

**Objective:** a website that feels great on the phone.

### Tasks
1. **Preference-checkpoint** — confirm default view, which filters matter most, saved-view presets to ship.
2. **Filter API** — `GET /api/items` accepts: category, source, platform, tag, time window, rating/priority, feedback state, read state; filters combine. *(TDD.)*
3. **`filter-build`** per dimension — data field → query param → mobile-first UI control (chips/sheets, thumb-friendly). *(TDD/E2E.)*
4. **Search + sort** — free-text over title/summary; sort by newest / priority / relevance.
5. **Saved views** — persist named filter presets in `saved_views` (e.g., "Morning read").
6. **Read state** — mark items opened; filter unread vs read.
7. **Design polish** — apply design tokens, hierarchy, designed hover/focus/active states; anti-template review.
8. **`mobile-ui-check`** — breakpoints 320/375/768/1024/1440; touch targets; CWV (LCP<2.5s, INP<200ms, CLS<0.1) on mobile; accessibility (keyboard, contrast, reduced-motion).

### Acceptance criteria
- All filter dimensions work and combine; fast and thumb-friendly on mobile.
- Search, sort, saved views, and read state work.
- Passes accessibility checks and mobile CWV targets; design clears the anti-template bar (CLAUDE.md §9).

### Skills / agents
`filter-build`, `mobile-ui-check`, `motion-ui`, `frontend-a11y`, `accessibility`, `a11y-architect`, `react-performance`, `performance-optimizer`, `e2e-runner`, `react-reviewer`.

---

## Subphase 1.6 — Source Discovery & Onboarding

**Objective:** turn *meta-sources* (lists/articles that recommend who/what to follow) into vetted catalog sources through a human rating gate, before anything reaches the feed.

### Slice = paste meta-source → extract candidates → rate → promote → validate

### Tasks
1. **Preference-checkpoint** — confirm rating scale (keep/skip/star vs 1–5), how candidates are extracted (paste a URL vs paste raw text/links), and the promotion threshold.
2. **Candidate intake** — a route/UI to submit a **meta-source** (a "best X to follow" article/list/thread); extract candidate handles/feeds/URLs into `source_candidates` (`platform`, `handle_or_url`, `why_suggested`, `sample_items`, `state='suggested'`). Treat pasted/fetched content as **untrusted** — sanitize. *(TDD.)*
3. **Rating gate UI** — list candidates with who/what they are, sample items, and why suggested; user rates (keep/skip/star). Mobile-first, thumb-friendly. *(TDD.)*
4. **Promote** — top-rated candidates → insert into `sources` as `active`; rating seeds initial `priority`/`weight`; `state='promoted'`. Low-rated → `rejected`/backlog (restorable). *(TDD.)*
5. **Validate on promote** — confirm the promoted feed/URL actually fetches (reuse the 1.2 connector dispatch); block promotion on a dead feed with a clear error.
6. **Backlog view** — list suggested/rejected candidates for later reconsideration.

### Acceptance criteria
- A "who to follow" list can be turned into vetted `active` sources via the rating gate.
- Nothing reaches the feed without explicit user approval; low-rated candidates stay in a backlog.
- Promotion validates the feed works; pasted content is sanitized; flows have tests.

### Skills / agents
`source-discovery`, `source-onboard`, `ingestion-connector` (validation), `react-patterns`, `react-test`, `security-reviewer` (untrusted meta-source input), `code-reviewer`.

> **Deferred to Phase 2.4:** automated citation/mention-trail discovery + periodic "new candidates to review" digest + in-app Source Management UI (add/pause/re-weight/archive). **Depends on:** 1.2; benefits from 1.4. *Can be pulled forward right after 1.2 if discovery becomes the priority.*

---

## Phase 1 Exit Checklist
- [ ] Owner uses the site daily on their phone.
- [ ] All core categories ingested (including secondary/aggregator sources), catalog-driven, refreshing automatically.
- [ ] Feedback shapes the feed; sources re-weight.
- [ ] Filtering/search/saved-views fast and pleasant on mobile.
- [ ] New sources can be discovered from meta-sources and vetted through the rating gate.
- [ ] Accessibility + mobile CWV targets met.
- [ ] → Proceed to Phase 2 planning (2.0).
