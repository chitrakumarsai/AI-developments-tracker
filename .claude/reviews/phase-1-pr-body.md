# Phase 1 — AI Chronicles: working single-user AI radar (1.0 → 1.6)

Delivers the entire Phase-1 scope from CLAUDE.md: a mobile-first Next.js + Supabase app
that ingests real AI content from many sources, ranks it, lets the user filter/search/react,
refreshes on a schedule, and vets new sources through a rating gate — all local, single-user,
no auth (Phase 2 adds auth + multi-user).

## Subphases shipped
- **1.0 — Scaffold:** Next.js (App Router, RSC) + Tailwind design tokens (light/.dark) +
  Supabase schema (5 core tables) + migrations. Product named **AI Chronicles**.
- **1.1 — First slice:** arXiv → fetched → stored → mobile feed.
- **1.2 — More sources:** catalog-driven ingestion + generic RSS connector; GitHub, Hugging
  Face (papers + models), Hacker News (score-gated), FAANG/NVIDIA company blogs; connectors
  treat all content as untrusted (sanitize + link-first).
- **1.3 — Scheduled refresh:** Vercel Cron, due-based + resilient, per-source intervals.
- **1.4 — Relevance ranking:** recency + per-source popularity (stars/likes/forks),
  interleaved feed; Reddit noise gate.
- **1.5 — Filters + polish:** source/tag filters, free-text search, thumbs + read-state
  (feedback loop feeding ranking), saved filter views, a11y pass (focus ring, contrast,
  44px touch targets). All filter state lives in the URL (shareable, no client store).
- **1.6 — Source onboarding:** propose a candidate → rate (skip/keep/⭐) → promote only after
  the feed validates; **paste-list import** extracts many candidates from one blob, deduped
  against the queue and live sources.

## Security (untrusted ingestion, §12.7)
- SSRF guard on every fetched URL (http/https only; blocks private/loopback/link-local/IMDS).
- **Redirect-based SSRF hardened:** feed validation follows redirects manually (≤5 hops) and
  re-checks the guard on every hop, so a public URL can't 30x→private host.
- Feed content sanitized before store/render; link-first (no full-content scraping).
- Saved-view filters whitelisted on read (untrusted stored JSON).
- Phase-2 deferrals (documented): CSRF, rate-limiting, per-user RLS scoping, auth.

## Testing
- 230 unit tests (connectors, ranking, filters, feedback, candidates, validation).
- tsc + eslint clean. Live smokes for ingestion, promote, and paste-list import against the
  hosted Supabase dev project (test data cleaned each time).

## Notes for review
- Single feature branch carries all of Phase 1 (34 commits) — reviewable subphase-by-subphase
  via the commit history.
- Plans/PRDs under `.claude/plans/` and `.claude/prds/`; per-slice gates (plan + pre-commit)
  followed throughout.
