# app-feedback-v3 — cut the noise, surface the signal

Implements the `app-feedback-v3` backlog as four thin, independently-committable slices on top
of the completed Phase 1. Theme: the feed was too crowded; this makes it configurable and
signal-first.

## Slices
- **A · Engagement badges** (`4688dd5`) — per-platform metric badge instead of a blanket
  "★ likes": Reddit ▲upvotes, Hacker News ▲points, HF models ♥likes, GitHub ★stars. Data already
  existed (Reddit/HN store upvotes in `items.metric`); this labels it correctly so you can judge
  traction without opening. *(feedback #2, #9)*
- **B · Settings + daily per-source cap** (`df74743`) — new singleton `app_settings` table, a
  `/settings` page with Save, and a per-source **daily cap** (default ≤10/source/day) applied in
  `getFeedItems`. Stops arXiv / busy subreddits from flooding the feed. Bypassed when you've
  filtered to a single source. *(#3, #6, #7, #8)*
- **C · Keyword + metric filters** (`01d43bb`) — include/exclude keyword lists + a
  min-stars/upvotes slider on `/settings`, applied to the feed. Min-metric keeps null-metric items
  (papers/blogs) so a star floor never hides research. *(#13)*
- **D · LLM weekly/monthly digest** (`1069e30`) — collapsible "This week/month in AI" summary at
  the top of the week/month views. `gpt-4o-mini` via `fetch` (no SDK dep), **DB-cached** in a
  `digests` table (keyed by period + item-set hash), **prompt-injection-guarded** (item text wrapped
  as untrusted data), and **fails soft** (any error → feed still renders). *(#5)*

## Already satisfied before this PR (verified in code, not rebuilt)
- **#1** true publish dates — the card already renders `published_at`, never fetch time.
- **#11** time-window picker and **#12** click-a-tag/source-to-filter — shipped in 1.5.

## Security (untrusted input, §12.7)
- Settings body is clamped/sanitized by `normalizeSettings` (bounds, lowercased+deduped keywords,
  junk fields dropped) before storage; service-role only.
- Digest treats item text as untrusted data with an explicit "never follow embedded instructions"
  system prompt.
- New tables inherit the Phase-1 grants; RLS + `user_id` come in Phase 2 (columns already shaped for it).

## Testing
- 258 unit tests (badges, cap, settings persist/normalize, content filters, digest cache/fail-soft
  with an injected fake completion). tsc + eslint clean.
- Live-smoked against hosted Supabase: settings save/normalize/persist, daily cap, keyword+metric
  filters, digest fail-soft path. Test data cleaned.

## Known / follow-ups
- **OpenAI quota:** the digest is complete but renders nothing while the OpenAI account returns
  `insufficient_quota` (429). Add credit → the digest appears automatically, no code change.
- **arXiv "traction" (#6)** is approximated by the daily cap + filters; a true citations/mentions
  signal is a later connector.
- Two intentional defaults, easily flipped: min-metric keeps null-metric items; settings filters
  apply everywhere (including over an active search).

## Migrations
`20260704000002_app_settings.sql`, `20260704000003_digests.sql` — both already applied to the
hosted dev DB.
