# ROADMAP — AI Developments Tracker

The phased master plan. Task-level detail for Phase 1 lives in [`.claude/plans/phase-1.plan.md`](./.claude/plans/phase-1.plan.md). Product/engineering spec is [`CLAUDE.md`](./CLAUDE.md).

**Stack:** Next.js + React + TS + Tailwind on Vercel · Supabase (Postgres + Auth + Storage) · Vercel Cron · Claude (sonnet/haiku) · optional FastAPI ingestion worker.

**First vertical slice:** **arXiv** (RSS/Atom, no API key) — proves the full pipeline and becomes the template every later connector copies.

---

## Guiding Principles (from CLAUDE.md)

- **Plan before execute** · **thin vertical slices** · **two gates per slice** (plan, pre-commit).
- **Ask the user's preferences at the start of every subphase and slice** (preference-checkpoint). ⭐
- **Right-size ceremony** · **research & reuse first** · **treat all ingested content as untrusted**.
- Do not advance to the next subphase until the current one is **working and approved**.

---

## Phase Overview

| Phase | Goal | Auth | Detail level |
|---|---|---|---|
| **Phase 1 — Development** | A working site running locally the owner uses daily | None (single user) | Full (this roadmap + phase-1.plan.md) |
| **Phase 2 — Production** | Proven product live for multiple users | Supabase Auth + RLS | Outline (refined at Phase 2 start) |

---

## Phase 1 — Development

> Local-first. Supabase via `supabase start`. Next.js via `npm run dev`. One user, no auth.

### Critical path
```
1.0 Planning & scaffold → 1.1 First slice (arXiv) → 1.2 More sources
        → 1.3 Scheduled refresh → 1.4 Feedback loop → 1.5 Filters + UI/UX polish
        → 1.6 Source discovery & onboarding
```

### 1.0 — Planning & Scaffold
- **Goal:** approved planning docs + a running empty skeleton.
- **Key work:** finalize data model + Supabase schema (migrations); scaffold Next.js app, Tailwind tokens, Supabase client; decide fate of existing root `main.py`; set up `.env.example`, lint/test/CI baseline.
- **Definition of done:** `supabase start` + `npm run dev` boot a blank but wired app; first migration applied; CI runs lint + tests green.
- **Depends on:** nothing.

### 1.1 — First Vertical Slice (arXiv)
- **Goal:** a running website showing real arXiv content end-to-end on mobile.
- **Key slice:** arXiv RSS → parse → dedupe → store in `items`/`sources` → API route → mobile-first feed list with working external links.
- **Definition of done:** open the app on a phone viewport, see recent arXiv papers from a seeded source, tap through to the paper at arxiv.org. Connector has tests; pipeline is the reusable template.
- **Depends on:** 1.0.

### 1.2 — More Sources
- **Goal:** aggregation across all core categories.
- **Key slices (one connector at a time, each reusing the 1.1 template):** GitHub trending → Hugging Face → company blogs (RSS) → Hacker News → Reddit → newsletters → YouTube → (X / LinkedIn last, hardest).
- **Secondary / aggregator sources (link-first):** treat curators that surface *others'* content — Hugging Face Papers, Papers with Code, newsletters (Import AI, The Batch, Last Week in AI), Reddit roundups — as ordinary sources whose `items` link straight to the original arXiv paper / tweet / post. This is the **preferred path for X & LinkedIn**, which are ToS-restricted to ingest directly: surface them *via* a secondary source + manual entry rather than scraping. (Finding *new* such sources is subphase 1.6.)
- **Definition of done:** the feed mixes items from multiple categories; each connector tested; the source catalog table drives what runs (no hardcoded sources).
- **Depends on:** 1.1 (the template).

### 1.3 — Scheduled Refresh
- **Goal:** content stays current without manual action.
- **Key work:** Vercel Cron → refresh route runs all `active` sources on their `refresh_interval`; idempotent + dedup-safe; failure logging per source; `last_fetched` updated.
- **Definition of done:** content updates automatically on schedule (daily / 2-day) without manual trigger; a failing source doesn't break the run.
- **Depends on:** 1.2.

### 1.4 — Feedback Loop
- **Goal:** the feed adapts to what the user likes.
- **Key work:** thumbs up/down on items → `feedback`; ranking = recency + source weight + feedback (+ optional Claude relevance score via `item-summarize`); source re-weighting from aggregate feedback.
- **Definition of done:** thumbs-down items are demoted/hidden; liked patterns boosted; sources re-weight over time; ranking has tests.
- **Depends on:** 1.2 (content to rate); benefits from 1.3.

### 1.5 — Filters + UI/UX Polish
- **Goal:** a website that feels great on the phone.
- **Key work:** full filtering & display controls (category, source, platform, tag, time, rating, feedback/read state); search; sort; saved views; modern opinionated design; accessibility + performance pass (`mobile-ui-check`).
- **Definition of done:** all filter dimensions work and combine, mobile-first and thumb-friendly; passes accessibility + Core Web Vitals targets on mobile; design clears the anti-template bar.
- **Depends on:** 1.1–1.4 (metadata + feedback fields exist to filter on).

### 1.6 — Source Discovery & Onboarding
- **Goal:** find new high-signal sources from *meta-sources* and vet them before they ever feed the site.
- **Mechanism (semi-manual, per CLAUDE.md §5):** the user pastes a **meta-source** — an article/list/thread that recommends *who/what to follow* (e.g., "best AI accounts on X", a curated list of arXiv-tracking feeds, good LinkedIn groups) → the system extracts **candidates** into `source_candidates` (`platform`, `handle_or_url`, `why_suggested`, `sample_items`) → the user **rates** them (keep/skip/star) → only top-rated candidates are **promoted** to `active` in the `sources` catalog (the rating seeds initial `priority`/`weight`). Each promoted feed/URL is validated to actually work.
- **Definition of done:** the user can turn a "who to follow" list into vetted catalog sources through the rating gate; low-rated candidates stay in a backlog; nothing reaches the feed without explicit approval.
- **Depends on:** 1.2 (catalog + ingestion to promote into); re-weighting benefits from 1.4. *Can be pulled forward right after 1.2 if discovery becomes the priority.*
- **Deferred to Phase 2.4:** automated citation/mention-trail discovery and the in-app Source Management UI.

### Phase 1 exit criteria
The owner uses the site daily on their phone; content from all core categories (including secondary/aggregator sources) refreshes automatically; feedback shapes the feed; filtering is fast and pleasant; new sources can be discovered from meta-sources and vetted through the rating gate. → proceed to Phase 2 planning.

---

## Phase 2 — Production (outline)

> Refined into task-level detail at the start of Phase 2. Deployed to hosted Vercel + Supabase.

- **2.0 — Production planning:** hosted Vercel + Supabase projects, secrets/monitoring, RLS/auth model, migration from local. *DoD: approved rollout plan.*
- **2.1 — Authentication:** Supabase Auth (accounts + login). `security-reviewer` mandatory. *DoD: users can sign in.*
- **2.2 — Per-user preferences:** user-scoped sources/feedback/saved-views behind RLS; personalized feeds. `database-reviewer` checks policies. *DoD: each user gets their own tuned feed; no cross-user leakage.*
- **2.3 — Deployment & hardening:** production deploy; security review; CSP + headers; rate limiting; mobile-network perf tuning. *DoD: live, secure, fast.*
- **2.4 — Discoverability & growth:** SEO, sharing, onboarding for new users; **automated source discovery** (citation/mention-trail analysis, periodic "new candidates to review" digest) and the in-app **Source Management UI** (add/pause/re-weight/archive without code). *DoD: others can find and onboard; sources self-suggest and are managed in-app.*

---

## Cross-Phase Workstreams

- **Source curation** — two mechanisms: (1) **secondary/aggregator sources** feed content link-first (rolled out in 1.2); (2) **discovery from meta-sources** proposes new candidates through the rating gate (`source-discovery`, `source-onboard`), formalized as subphase 1.6, plus periodic `source-audit`. Semi-manual in Phase 1; automated citation/mention-trail discovery + Source Management UI deferred to Phase 2.4.
- **LLM pipeline** — `item-summarize` introduced in 1.4; kept budget-aware and cached throughout.
- **Quality gates** — every slice: `/code-review`; `security-reviewer` whenever auth/user-data/untrusted-ingestion is touched.

---

## Open Decisions

- **Product name** — still to be chosen (currently "AI Developments Tracker").
- **Fate of root `main.py`** — becomes the optional `worker/` or is retired (decided in 1.0).
- **Refresh cadence** — daily vs every 2 days, per-source overrides (settled in 1.3).
- **LLM relevance scoring** — on by default in 1.4 vs opt-in (settled in 1.4 preference-checkpoint).

---

## Risk Register (top items)

| Risk | Mitigation |
|---|---|
| X / LinkedIn hard/ToS-restricted to ingest | Prefer **secondary/aggregator sources** (curators that surface their content) + curated lists + manual entry; defer direct connectors to end of 1.2; never violate ToS |
| Scraping fragility | Link-first + RSS/API preference order; scraping is the exception |
| LLM cost creep | Haiku for bulk, cache results, score only new/long-listed items |
| Source noise | Human rating gate — only top-rated sources go live |
| SQLite/Postgres drift | Avoided — Supabase Postgres from day one |
