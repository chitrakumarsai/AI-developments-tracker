# CLAUDE.md

Authoritative guidance for Claude Code working in this repository. **Read this fully before doing any work here.** This file is self-contained: it holds both *what/why* (product) and *how* (engineering). (`ideas-v2.md` is the original brainstorm; this file supersedes it as the spec.)

---

## Table of Contents

1. Project Overview & Core Insight
2. Tech Stack (locked)
3. Content Categories
4. Sources to Track (full catalog)
5. Source Discovery & Vetting System
6. Source Catalog System
7. Ingestion Strategy (link-first)
8. Core Features
9. UI / UX & Design Requirements
10. User Scope
11. Data Model
12. How We Work Here (non-negotiable)
13. Per-Slice Workflow
14. Two-Phase Delivery Model
15. Repository Structure
16. Skills Catalog
17. Sub-Agents
18. Coding Conventions
19. Commands
20. Deployment (Vercel + Supabase)
21. Security & Secrets
22. Git & PRs
23. Quick Reference

---

## 1. Project Overview & Core Insight

**AI Developments Tracker** (working name) is a personalized website that aggregates everything happening in AI that the user finds relevant — a personal AI radar, not a generic news feed.

**Problem.** The AI field evolves at an overwhelming pace — new research papers, GitHub repositories, products, and models drop weekly. Staying current requires monitoring too many platforms simultaneously (X.com, LinkedIn, Reddit, arXiv, conferences, company blogs), making it practically impossible for one person to keep up without falling behind. Miss two weeks and you're far behind.

**The core insight — signal, not noise.** The real problem isn't lack of information — it's **noise and distraction**. When the user opens X or LinkedIn to read *one* important thing, they get pulled into an endless feed and lose focus. The question is never "is there content?" — it's **"what is the one thing worth reading right now?"**

This tool answers that question. It does the watching across all platforms, surfaces only what matters, and points the user straight to it — so they can read that single article or paper **at the source** without wading through the feed. **The website is the filter and the index; the original platforms remain where the user actually reads.** Most items are stored as *metadata + link*, not full scraped content.

---

## 2. Tech Stack (locked)

Primary target is **Supabase + Vercel** (single cloud platform, free auth in Phase 2).

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Next.js (App Router) + React + TypeScript | Mobile-first is the top priority, not an afterthought |
| **Styling** | Tailwind CSS | Design tokens for palette/typography/spacing; no ad-hoc magic values |
| **Hosting** | Vercel | Git-driven deploys, preview URLs per PR |
| **API / backend** | Next.js Route Handlers + Server Actions | Primary backend logic lives here |
| **Database** | Supabase (PostgreSQL) | From day one. Development runs against a **hosted Supabase Cloud** project; local `supabase start` remains available as a fallback. Prod project added in Phase 2.3 |
| **Auth** | Supabase Auth | Disabled/single-user in Phase 1; powers multi-user in Phase 2 |
| **Storage** | Supabase Storage | Only if needed (e.g., cached thumbnails) |
| **Scheduling** | Vercel Cron | Triggers scheduled refresh |
| **Ingestion** | TS in Next.js route handlers (`rss-parser`, `undici`) | Primary path |
| **Ingestion worker (optional)** | FastAPI (Python) + `feedparser`/`httpx`/`APScheduler` | Only for sources where Python parsing is clearly better; deployed separately |
| **LLM** | OpenAI — `gpt-4o` (quality), `gpt-4o-mini` (bulk) | Summaries + relevance scoring; budget-aware, results cached. `OPENAI_API_KEY` |
| **Migrations** | Supabase migrations (SQL via Supabase CLI) | Schema is versioned from the first table |

> Stack is decided. Do not switch frameworks/platforms without explicit user approval. Within these choices, libraries are proposed per slice via the preference checkpoint (§12.4). The existing root `main.py` / `pyproject.toml` either become the optional `worker/` (FastAPI) or are retired during subphase 1.0 — decided with the user.

---

## 3. Content Categories

High-level buckets the website tracks. Each is fed by one or more concrete *sources* (§4).

| Category | What it covers |
|---|---|
| **People** | Researchers, engineers, founders, thought leaders worth following |
| **Companies & Labs** | Org-level announcements, blog posts, model releases |
| **Research Papers** | Preprints and peer-reviewed publications |
| **Conferences** | Accepted papers, proceedings, schedules |
| **GitHub Repositories** | New and trending AI repos, notable releases |
| **LLM & Other Models** | New model launches, benchmarks, leaderboards, version updates |
| **Products & Tools** | AI products and tools being launched |
| **Social / Discussion** | Curated posts from X, LinkedIn, Reddit, forums |
| **Newsletters & Blogs** | High-signal written roundups and analysis |
| **Video & Podcasts** | Talks, interviews, technical explainers |
| **Datasets & Benchmarks** | New datasets, evals, and benchmark results |
| **Funding & Industry** | Funding rounds, acquisitions, regulation, policy |

---

## 4. Sources to Track (full catalog)

> **The quality of the website is only as good as the quality of its sources.** Sources are the most important asset in the project — treated as first-class, curated data, **not hardcoded values**. This is a *starter* catalog; it grows and shrinks over time via the Source Catalog System (§6).

### Research Papers & Preprints
- **arXiv** — cs.AI, cs.LG, cs.CL, cs.CV, cs.NE, stat.ML (per-category feeds)
- **Papers with Code** — trending papers + SOTA leaderboards
- **OpenReview** — conference submissions and reviews
- **Semantic Scholar** — citation-aware discovery
- **Hugging Face Papers** — daily curated paper picks
- **bioRxiv / medRxiv** — AI-in-bio crossover (optional)

### Conferences & Proceedings
- **Top-tier:** NeurIPS, ICML, ICLR, CVPR, ICCV, ECCV, ACL, EMNLP, NAACL, AAAI, KDD, SIGGRAPH
- **Specialized:** COLM (language models), CoRL (robotics), RecSys, INTERSPEECH
- Proceedings pages + accepted-paper lists

### Code & Models
- **GitHub** — trending (daily/weekly), specific orgs/repos, new releases of watched repos
- **Hugging Face** — trending models, datasets, and Spaces
- **Model leaderboards** — LMSYS Chatbot Arena, Open LLM Leaderboard, SWE-bench, etc.
- **Ollama / model registries** — new local-model availability

### Companies, Labs & Official Blogs
- OpenAI, Anthropic, Google DeepMind, Google AI, Meta AI / FAIR, Microsoft Research, Mistral, Cohere, xAI, Stability AI, Hugging Face, NVIDIA, Apple ML, Amazon Science, Qwen/Alibaba, DeepSeek, AI2 (Allen Institute)
- Their **official blogs + release notes + changelogs** (often RSS-available)

### Social & Discussion
- **X.com** — curated list of accounts (researchers, labs, builders); specific lists, **not** the full feed
- **LinkedIn** — selected people and company pages
- **Reddit** — r/MachineLearning, r/LocalLLaMA, r/artificial, r/StableDiffusion, r/OpenAI, r/singularity (filtered)
- **Hacker News** — AI-tagged / high-score stories
- **Discord / Slack communities** — optional, harder to ingest

### Newsletters & Written Roundups
- Import AI (Jack Clark), The Batch (DeepLearning.AI), Last Week in AI, AI News (smol.ai), TLDR AI, Ahead of AI (Sebastian Raschka), The Sequence, Hugging Face Daily

### Video & Audio
- YouTube channels (Yannic Kilcher, Two Minute Papers, lab talk uploads, conference recordings)
- Podcasts (Latent Space, Dwarkesh, The TWIML AI Podcast, No Priors)

### Industry, Funding & Policy
- TechCrunch AI, The Information, VentureBeat AI, funding trackers (Crunchbase signals)
- Policy/regulation trackers (EU AI Act updates, US executive actions) — optional

### Candidate additions to discuss
Patents (USPTO AI filings), Google Scholar author alerts, product directories (Product Hunt AI, There's An AI For That), GitHub Awesome-lists, academic lab pages for followed groups.

---

## 5. Source Discovery & Vetting System

> A platform like X, LinkedIn, or Reddit is not *one* source — it's thousands of potential sources buried in noise. Before anything is ingested, we need a system that answers: **"Within this noisy site, *who* and *what* is actually worth following?"** — then lets the user approve it. This is distinct from the catalog (§6): the catalog manages *accepted* sources; this system **finds and vets candidates**.

### The problem it solves
The user can't manually audit all of X or Reddit. For each platform, the system helps identify the relevant *places within it* — the specific accounts, subreddits, hashtags, lists, or pages where the signal lives — instead of subscribing to the whole firehose.

### How discovery works (per platform)

| Platform | What it surfaces | Discovery signals |
|---|---|---|
| **X.com** | Specific accounts & curated lists | Accounts frequently cited by trusted people, high signal-to-post ratio, followed-by-many-researchers, authors of liked papers |
| **LinkedIn** | People & company pages | Researchers/founders posting substantive AI content, companies whose posts get shared in the user's circles |
| **Reddit** | Subreddits & high-karma contributors | Subreddits with consistent technical discussion; users/threads that repeatedly produce quality |
| **GitHub** | Orgs, users, topics | Authors of trending repos, orgs behind tracked models |
| **YouTube / Podcasts** | Channels & shows | Recurring uploads of talks, interviews, technical explainers |
| **Blogs / Newsletters** | Specific feeds | Linked repeatedly by other trusted sources |

> Strong cross-platform signal: **the people and outlets that already-trusted sources keep referencing.** Discovery can follow these citation/mention trails to suggest new candidates.

### The rating gate (human-in-the-loop curation)
Discovery only *proposes*. **The user decides.** The system presents candidates and asks the user to **rate them**; only top-rated candidates are promoted into the live catalog.

- For each candidate, show: who/what it is, a few sample items, and why it was suggested.
- User gives a **quality rating** (e.g., 1–5 stars, or keep / skip / maybe).
- **Only top-rated candidates are promoted** to `active` in the catalog and start feeding the website.
- Low-rated candidates are dropped or kept in a "suggested" backlog for later reconsideration.
- This rating becomes the source's initial `priority` / `weight`.

> This keeps the user firmly in control of quality. The website only ever shows content from sources the user has explicitly vetted and rated highly — noise never makes it in by default.

### The full source pipeline
```
Discover candidates   →   User rates   →   Promote top-rated   →   Catalog   →   Ingest
(find signal in the       (keep/skip/        (only high-rated      (manage      (RSS/API/
 noise, per platform)      star rating)        become active)       sources)     link)
```

### Where this lives in the plan
- **Phase 1:** lightweight — discovery starts semi-manual (user pastes a platform/topic; system suggests candidates; user rates them in a simple list). A curated seed list + rating step is enough to start.
- **Later:** smarter automated discovery (citation/mention-trail analysis, periodic "new candidates to review" digest) via the Source Management UI.

---

## 6. Source Catalog System

Sources are managed data, not code. The website needs a robust system to **list, describe, and maintain** them.

### Each source is a structured record

| Field | Purpose |
|---|---|
| `id` | Stable unique identifier |
| `name` | Human-readable name |
| `category` | Which content category it feeds |
| `url` | Source location (feed, page, API, or profile) |
| `ingestion_type` | `rss` · `api` · `scrape` · `manual` |
| `status` | `active` · `paused` · `archived` |
| `priority` / `weight` | Influences ranking and how prominently items surface |
| `refresh_interval` | How often this source is checked |
| `tags` | Free-form labels for filtering (`nlp`, `vision`, `local-llm`) |
| `added_on` / `last_fetched` | Provenance and freshness tracking |
| `notes` | Why this source matters / what to expect |

### Source lifecycle (editing & curation)
Sources change relevance over time, so the catalog must be **fully editable**:
- **Add** a source any time (with validation that the URL/feed actually works).
- **Pause** a source temporarily without losing its history.
- **Archive / remove** a noisy or irrelevant source — **soft-delete preferred** (restorable).
- **Re-weight** a source up or down based on usefulness.
- **Review periodically** — a lightweight recurring check to prune dead or low-signal sources.

> Long term, source weighting is informed by the feedback loop: sources whose items get consistent thumbs-up are boosted; consistently ignored sources are demoted or flagged.

### Where this lives in the plan
- **Phase 1:** sources in an editable Supabase table with manual add/edit/remove.
- **Later:** an in-app **Source Management UI** to add, pause, re-weight, and archive without touching code.

---

## 7. Ingestion Strategy (link-first)

> **Key principle:** the goal is **surfacing the right thing to read**, not republishing content. We do **not** scrape and store full article bodies by default.

### The principle
The website's job is to say *"this is the one thing worth reading"* and link straight to it; the user reads the full piece at the source. For most items, **metadata + link** is enough:
- Title
- Source & author
- Short summary or snippet (if cheaply available)
- Published date
- **Direct link to the original** (the primary payload)

This avoids the legal, technical, and maintenance burden of full scraping, and respects the original platforms.

### Ingestion methods, in order of preference
1. **Official feeds (RSS / Atom)** — cleanest, most stable; arXiv, most blogs, Reddit, YouTube, many newsletters.
2. **Official APIs** — GitHub, Hugging Face, Reddit, arXiv, YouTube, X (where access allows).
3. **Lightweight metadata scraping** — only title/link/date when no feed or API exists.
4. **Manual entry** — for high-value sources resisting automation, the user pastes a link.

> Full-content scraping is a deliberate *exception*, only when reading inline genuinely adds value and the source permits — decided per-source during planning.

### Why this matters for the noise problem
Because the tool only needs the **link + just enough context to decide**, it stays fast, lightweight, and focused on its real job: being the **filter** that replaces doomscrolling. The user goes to X or LinkedIn with intent — reads the one thing, then leaves.

---

## 8. Core Features

### 8.1 Aggregation
- Pull content from multiple sources into one place.
- Surface only what's relevant — not everything, just the signal.

### 8.2 Personalization & Feedback Loop
- Simple **thumbs up / thumbs down** on individual items.
- System learns preferences over time and adjusts what's surfaced.
- Feedback also informs **source re-weighting** (§6).
- Detailed mechanism defined during development (Phase 1.4).

### 8.3 Filtering & Display Controls
Let the user slice the feed to exactly what they want, to focus on one type of content without the rest getting in the way.

**Filter dimensions:**
- **By category** — only Research Papers, only GitHub repos, only Models, etc. (any combination)
- **By source** — only items from specific sources (e.g., only arXiv, only a given X list)
- **By platform** — X, LinkedIn, Reddit, GitHub, blogs, etc.
- **By tag / topic** — `nlp`, `vision`, `local-llm`, `agents`, `rl`, etc.
- **By time window** — today, last 2 days, this week, custom range
- **By rating / priority** — only items from top-rated/high-weight sources
- **By feedback state** — hide already-thumbs-downed; optionally show only liked / unseen
- **By read state** — unread vs. already-opened

**Display & interaction:**
- **Search** — free-text across titles/summaries
- **Sort** — newest first, highest source priority, or most-relevant-to-preferences
- **Combine filters** — multiple apply together (e.g., "Research Papers + `vision` + this week + top-rated")
- **Saved filter views** — save common combinations as presets (e.g., a "Morning read" view)
- **Mobile-first filtering** — fast and thumb-friendly on the phone, not buried in a desktop-only sidebar
- **Clear active/empty states** — always show which filters are active and an easy reset

> Filters operate on structured metadata captured at ingestion (category, source, tags, date, rating, feedback state), so they can be built incrementally as those fields land.

### 8.4 Content Refresh
- Frequency: once a day or once every two days (via Vercel Cron).
- Per-source `refresh_interval` allows finer control.
- Exact schedule finalized during planning.

### 8.5 Naming
- The website needs a strong, memorable name — **to be decided**, open to ideas.

---

## 9. UI / UX & Design Requirements

- **Extremely modern interface** — opinionated and polished, not a generic template look.
- **Extremely user-friendly** — low friction, content-first, easy to scan quickly.
- **Mobile-first, not just responsive** — the user often reads while travelling or on the phone, so the mobile experience is the **top priority**, not an afterthought.
- **Works seamlessly across breakpoints** — phone, tablet, laptop, desktop (test 320/375/768/1024/1440).
- **Fast** — quick loads and smooth interactions even on mobile networks.
- **Touch-friendly controls** — thumbs up/down, filters, and navigation all work well by thumb.
- **Anti-template policy** — real hierarchy via scale contrast, intentional spacing rhythm, designed hover/focus/active states, deliberate palette + type pairing. It must look believable in a real product screenshot.

---

## 10. User Scope

| Phase | Auth | Users |
|---|---|---|
| **Phase 1** | None (single seeded user; Supabase RLS relaxed) | Single user (the owner) |
| **Phase 2** | Supabase Auth | Multiple users, each with their own preferences and personalized feed (enforced via RLS) |

---

## 11. Data Model (core entities — finalized in subphase 1.0)

All tables in Supabase Postgres; versioned via Supabase migrations. RLS policies added in Phase 2.

- **`sources`** — vetted, catalogued source. Fields per §6 record schema. Soft-delete via `status='archived'`.
- **`items`** — a piece of content. Fields: `id`, `source_id`, `title`, `author`, `summary` (short/LLM), `url` (primary payload — link-first), `published_at`, `fetched_at`, `category`, `tags[]`, `relevance_score`, `read_state`. Dedupe on `url`.
- **`feedback`** — user signal on an item: `id`, `item_id`, `user_id` (Phase 2), `value` (up/down), `created_at`. Feeds ranking + source re-weighting.
- **`source_candidates`** — discovered, not-yet-promoted source: `id`, `platform`, `handle_or_url`, `why_suggested`, `sample_items`, `rating`, `state` (`suggested` · `promoted` · `rejected`).
- **`saved_views`** — a named filter preset (e.g., "Morning read").
- *(Phase 2)* **`users`** + per-user preferences (via Supabase Auth + RLS).

---

## 12. How We Work Here (NON-NEGOTIABLE)

These rules govern *every* task in this repo — from the user and ECC best practices.

### 12.1 Plan before execute, always
Never write implementation code before an approved plan. Planning and execution are separate stages. Use the markdown-staged flow: **`/plan-prd` → `/plan` → `tdd-workflow` → `/code-review` → `/pr`**. Artifacts are committable markdown under `.claude/prds/`, `.claude/plans/`, `.claude/reviews/`.

### 12.2 Build in thin vertical slices
Ship one complete end-to-end path first (one source → stored → displayed on mobile), **not** "all backend then all frontend." Each slice is independently runnable, testable, reviewable. Start simplest; layer features one at a time. Resist building everything at once.

### 12.3 Two human gates per slice (gated, not autonomous)
- **GATE 1 — after planning:** present the plan/task list. Do **not** write implementation code until approved.
- **GATE 2 — before commit:** present diff + review. Do **not** commit/push until approved.

### 12.4 ⭐ Ask for the user's preferences at every stage ⭐
**Hard requirement.** At the start of each subphase *and* each slice, **stop and ask the user for preferences before proceeding** — do not assume.
- Use the **AskUserQuestion** tool; present concrete, mutually-exclusive options with a clear recommendation first.
- Ask about decisions that actually change the outcome: slice scope, library choices, UX/layout direction, data-model shape, ranking behavior, refresh cadence, naming, etc.
- Surface trade-offs; never silently pick. Record chosen preferences in the slice's PRD/plan so they persist.
- This is the **`preference-checkpoint`** ritual (§16): runs at the start of a subphase, the start of a slice (Gate 0), and any genuine fork.

### 12.5 Right-size the ceremony
| Tier | Example | Phases |
|---|---|---|
| trivial | one-line fix | implement → review → commit |
| small | one function | light plan → implement → review → commit |
| standard | 2–5 files | plan → implement → review → commit |
| large | cross-cutting / new dep / new contract | research → plan → (scaffold) → implement → review → commit |

Anything touching **auth, user data, or external/untrusted ingested content** is **at least** standard and gets a `security-reviewer` pass.

### 12.6 Research & reuse first
Before new code: search GitHub (`gh search repos`/`gh search code`), check vendor docs (Context7), check registries (npm/PyPI). Prefer a proven library over hand-rolling (feed parsing, scheduling, auth).

### 12.7 Treat all ingested content as untrusted
RSS, scraped HTML, social posts, and LLM outputs are **untrusted input**. Sanitize before storing or rendering. Never render raw HTML from a source unsanitized. Never let ingested text act as instructions to the LLM (prompt-injection surface) — wrap external content clearly and validate.

### 12.8 ⭐ Always consult the `ECC/` files for skills & rules ⭐
**Standing rule from the user.** While building this project, **always refer to the files under `ECC/`** for skills and rules — read the actual source files, don't work from memory or assumption.

- **Rules** — before/while writing code, consult the relevant rule files:
  - `ECC/rules/common/` — language-agnostic (coding-style, testing, security, patterns, performance, git-workflow, development-workflow, code-review, agents).
  - `ECC/rules/web/` — frontend (coding-style, design-quality, performance, patterns, security, testing).
  - `ECC/rules/react/`, `ECC/rules/typescript/` — for the Next.js/React/TS frontend + API.
  - `ECC/rules/python/` — for the optional FastAPI `worker/`.
  - `ECC/RULES.md` — index of the ruleset.
- **Skills** — the canonical skill definitions live under `ECC/skills/<name>/SKILL.md` (271 skills). When a skill is named in this file or chosen for a slice, **read its `SKILL.md` first** and pass its conventions into any subagent prompt.
- **Precedence** — language-specific rules override `common/` where they conflict (specific beats general). When ECC rules and this file conflict, ECC rules win on *how to code*; this file wins on *what/why for this product*.
- This applies at every slice, not just once — re-open the relevant `ECC/` files as each new area of work begins.

---

## 13. Per-Slice Workflow

```
preference-checkpoint  →  /plan-prd  →  /plan  →  tdd-workflow  →  /code-review  →  /pr
   (ask user prefs)        (why?)       (how?)     (build+test)     (quality)       (ship)
        │                    │            │                             │
   recorded prefs         PRD.md       plan.md                    review notes
                                   [GATE 1: approve plan]   [GATE 2: approve before commit]
```

1. **Preference checkpoint** — ask the user for preferences for this slice (§12.4).
2. **Research & reuse** — find existing implementations/libraries.
3. **Plan** — `planner` / `architect` produce an ordered task list of thin slices → **GATE 1**.
4. **Implement (TDD)** — red → green → refactor per task. Target 80%+ coverage.
5. **Review** — `code-reviewer`; add `security-reviewer` for auth / user data / ingestion.
6. **Commit & PR** — conventional commits, one per logical chunk → **GATE 2**.

---

## 14. Two-Phase Delivery Model

Two macro-phases, each split into subphases. **Do not advance until the current subphase works and is approved.** Each subphase is delivered as one or more thin vertical slices through the §13 workflow.

### Phase 1 — Development (local, single-user, no auth)
Goal: a working website running locally that the user can use daily.

| Subphase | Focus | Outcome |
|---|---|---|
| **1.0 — Planning & scaffold** | Write PRD + roadmap. Finalize data model + Supabase schema. Scaffold Next.js app + Supabase local. Decide fate of existing `main.py`. No feature code. | Approved planning docs + running skeleton |
| **1.1 — First vertical slice** | One source (e.g., arXiv *or* GitHub trending) → fetched → stored in Supabase → displayed in a clean, mobile-first list. Refresh manual/stubbed. | Running website showing real AI content from one source |
| **1.2 — More sources** | Add remaining categories one at a time (papers, repos, models, companies, people, X, LinkedIn, Reddit, products, conferences). Includes **secondary / aggregator sources** (curators that surface others' content — HF Papers, Papers with Code, newsletters, Reddit roundups) ingested link-first; this is the **preferred path for X & LinkedIn** (ToS-restricted to ingest directly). | Aggregation across all core categories |
| **1.3 — Scheduled refresh** | Automate daily / two-day refresh via Vercel Cron (+ per-source intervals). | Content stays current automatically |
| **1.4 — Feedback loop** | Thumbs up/down; basic preference-aware ranking; source re-weighting. | The feed adapts to what the user likes |
| **1.5 — Filters + UI/UX polish** | Full filtering & display controls; modern, opinionated, highly mobile-friendly design; accessibility pass. | A website that feels great on the phone |
| **1.6 — Source discovery & onboarding** | Semi-manual discovery from **meta-sources** (§5): user pastes a "who/what to follow" list/article → system extracts `source_candidates` → user **rates** (keep/skip/star) → only top-rated are promoted to `active`. Validates each feed/URL works. *(Automated citation/mention-trail discovery + in-app Source Management UI deferred to 2.4.)* | New sources are vetted through the rating gate before they ever feed the site |

### Phase 2 — Production (deployed, multi-user, authenticated)
Goal: take the proven product live for other users.

| Subphase | Focus | Outcome |
|---|---|---|
| **2.0 — Production planning** | Plan Vercel/Supabase prod setup, secrets, monitoring, RLS/auth model. | Approved production rollout plan |
| **2.1 — Authentication** | Supabase Auth — accounts + login. | Individual users can sign in |
| **2.2 — Per-user preferences** | Per-user preferences/feedback via RLS; personalized feeds. | Every user gets a feed tuned to them |
| **2.3 — Deployment & hardening** | Production deploy to Vercel + Supabase; security review; mobile-network perf tuning. | Live, secure, fast website |
| **2.4 — Discoverability & growth** | SEO, sharing, onboarding for new users; **automated source discovery** (citation/mention-trail analysis, periodic "new candidates to review" digest) and the in-app **Source Management UI** (add/pause/re-weight/archive without code). | Others can find and use the site; sources self-suggest and are managed in-app |

---

## 15. Repository Structure

> Established in subphase 1.0. The Next.js app lives in `web/` (Vercel "Root Directory" = `web/`) so it's cleanly isolated from the vendored `ECC/` reference folder. The old root `main.py` stub was retired (TS-first); an optional FastAPI `worker/` may be added later only if a source needs Python.

```
ai-developments-tracker/            # repo root: docs, supabase/, ECC/, .claude/
├── web/                            # Next.js app  ← Vercel root dir
│   ├── app/                        # App Router
│   │   ├── layout.tsx · page.tsx   # Sonar shell (Editorial/Swiss, Inter+Fraunces)
│   │   ├── globals.css             # design tokens (light + .dark)
│   │   └── api/                    # Route Handlers (items, sources, feedback, cron)
│   ├── components/                 # by feature/surface: feed/ filters/ sources/ ui/
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase/               # client + typed queries
│   │   ├── ingestion/              # types.ts (connector contract) + rss/ api/ scrape/ manual/
│   │   ├── ranking/                # recency + weight + feedback + LLM score
│   │   └── llm/                    # OpenAI summarize + score (budget-aware, cached)
│   ├── .env.example
│   └── package.json
├── supabase/
│   ├── migrations/                 # SQL migrations (20260622000001_init.sql = 5 core tables)
│   └── seed.sql                    # seeds the first arXiv source
├── worker/                         # OPTIONAL FastAPI Python ingestion worker (later)
├── .claude/
│   └── prds/  plans/  reviews/  skills/
├── ECC/                            # vendored ECC reference (gitignored) — rules & skills
├── ROADMAP.md                      # phased master plan
├── ideas-v2.md                     # original brainstorm (superseded by this file)
└── CLAUDE.md                       # this file — authoritative spec
```

---

## 16. Skills Catalog

Two tiers: **ECC skills** (installed globally, use as-is) and **project-specific skills** (defined under `.claude/skills/`). When spawning a subagent, pass the relevant skill's conventions into the agent's prompt.

> **Always read the canonical definition first** (§12.8): `ECC/skills/<name>/SKILL.md`. Don't rely on the name alone — open the file and follow its "When to Use / How It Works" guidance.

### 16.1 ECC skills to use (by stage)

| Stage | Skills |
|---|---|
| Planning | `/plan`, `/plan-prd`, `feature-dev` |
| Frontend design | `frontend-design-direction`, `design-system`, `taste`, `make-interfaces-feel-better`, `liquid-glass-design` |
| Frontend build | `react-patterns`, `frontend-patterns`, `nextjs-turbopack`, `react-performance` |
| Mobile & motion | `motion-ui`, `motion-foundations`, `frontend-a11y`, `accessibility` |
| Backend / API | `react-patterns` (route handlers), `backend-patterns`; `fastapi-patterns` + `python-patterns` for the optional worker |
| Data | `postgres-patterns`, `database-migrations` |
| Testing | `react-test`, `python-testing`, `e2e-testing`, `browser-qa` |
| Quality & security | `/code-review`, `security-scan`, `security-review` |
| Deployment | `deployment-patterns`, `docker-patterns` |
| Discoverability | `seo` |

### 16.2 Project-specific skills (define under `.claude/skills/`)

Each entry is the spec for a skill to create (name · when to use · what it does · output).

| Skill | When to use | What it does | Output |
|---|---|---|---|
| **`preference-checkpoint`** | Start of every subphase and slice, and at any real fork | Runs the §12.4 ritual: presents concrete options via AskUserQuestion with a recommendation, captures choices | Recorded preferences appended to the slice's PRD/plan |
| **`slice-plan`** | Beginning a subphase or feature | Turns a section of this spec into a thin-vertical-slice PRD + plan with the two gates | `.claude/prds/*.prd.md` + `.claude/plans/*.plan.md` |
| **`source-discovery`** | Finding signal within a noisy platform | Surfaces candidate accounts/subreddits/channels per platform via citation/mention trails | List of `source_candidates` to rate |
| **`source-onboard`** | Adding a new source | Drives Discover → rate → promote-if-top-rated → catalog; validates the feed/URL works | New `sources` row (`active`) or `source_candidates` (backlog) |
| **`source-audit`** | Periodic source review | Finds dead/low-signal sources, re-weights from feedback, flags pruning candidates | Audit report + proposed catalog changes (user-approved) |
| **`ingestion-connector`** | Wiring a new RSS/API/scrape connector | Scaffolds a connector with the link-first contract (metadata + link), error handling, tests; sanitizes untrusted content | Connector module + tests in `lib/ingestion/` (or `worker/`) |
| **`item-summarize`** | Items need summaries / relevance | Budget-aware OpenAI pipeline (`gpt-4o` / `gpt-4o-mini`): summarize + score relevance, cache results, treat input as untrusted | Populated `summary` + `relevance_score` |
| **`feed-rank`** | Tuning what surfaces first | Implements/adjusts ranking = recency + source weight + feedback + LLM score | Updated ranking logic + tests |
| **`filter-build`** | Adding a filter dimension | Builds a filter end-to-end: data field → API query param → mobile-first UI control | Working filter across the stack |
| **`mobile-ui-check`** | After any UI change | Verifies mobile-first: breakpoints (320/375/768/1024/1440), touch-target sizes, performance budget | Pass/fail report + fixes |

> **Building these:** define each as Markdown with frontmatter (`name`, `description`) and sections (When to Use, How It Works, Examples), per ECC `skill-create` / `SKILL-DEVELOPMENT-GUIDE`. Reuse ECC skill content where it overlaps rather than duplicating. Create them on demand as each slice first needs them — not all up front (YAGNI).

---

## 17. Sub-Agents

| Sub-Agent | Role |
|---|---|
| `planner` | Turn spec sections into phased plans |
| `architect` / `code-architect` | System design, data model, ingestion pipeline architecture |
| `react-reviewer` | Review frontend (`.tsx`/`.jsx`) changes |
| `a11y-architect` | Accessibility + mobile usability standards |
| `performance-optimizer` | Keep the site fast on mobile networks |
| `python-reviewer` | Review the optional FastAPI worker |
| `database-reviewer` | Review schema, queries, and RLS policies |
| `security-reviewer` | **Mandatory** for auth, user data, ingestion of untrusted content |
| `e2e-runner` | Drive end-to-end tests across key flows |
| `code-reviewer` | General quality pass on all changes |

---

## 18. Coding Conventions

> **Read the source rule files under `ECC/rules/` before coding** (§12.8): `common/`, `web/`, `react/`, `typescript/`, and `python/` (for the worker). The summaries below are pointers, not replacements.

**General** (`ECC/rules/common/coding-style.md`): immutable patterns (new objects, no in-place mutation); KISS/DRY/YAGNI; many small focused files (200–400 lines typical, 800 max); explicit error handling, never swallow errors; validate at boundaries; named constants over magic numbers; early returns over deep nesting.

**Frontend** (ECC web rules): mobile-first Tailwind; design tokens in `styles/tokens.css` (palette/typography/spacing — no repeated hardcoded values); organize components by feature/surface; semantic HTML first; animate only compositor-friendly properties (`transform`, `opacity`, `clip-path`); PascalCase components, `use`-prefixed hooks, kebab-case CSS classes. Honor the anti-template policy (§9).

**Backend / API** (TypeScript): typed Supabase queries; validate input at the route boundary (e.g., Zod); small focused handlers. **Optional worker** (Python, ECC python rules): PEP 8, type hints, Pydantic validation, async where it helps ingestion.

**Testing** (ECC `common/testing`): TDD (red → green → refactor); 80%+ coverage; unit + integration + E2E; AAA structure; descriptive test names. For visual-heavy UI prefer visual-regression/E2E over brittle markup assertions.

---

## 19. Commands

> Finalized during scaffolding (subphase 1.0). Intended shape:

```bash
# Next.js app (root)
npm run dev               # local dev server
npm run build             # production build
npm run lint              # eslint
npm run test              # unit/component tests
npx playwright test       # E2E

# Supabase (local stack + migrations)
supabase start            # spin up local Postgres/Auth/Studio
supabase db push          # apply migrations to local
supabase migration new <name>
supabase gen types typescript --local   # typed DB client

# Vercel
vercel                    # deploy preview
vercel --prod             # production deploy

# Optional FastAPI worker
cd worker && uvicorn app.main:app --reload
cd worker && pytest
```

---

## 20. Deployment (Vercel + Supabase)

- **Frontend + API:** Vercel — Git-driven; every PR gets a preview URL; `main` deploys to production.
- **Database / Auth / Storage:** Supabase — one project for dev, one for prod (or branches). Schema changes flow through `supabase/migrations/`.
- **Scheduled refresh:** Vercel Cron hits an internal route handler that runs ingestion.
- **Optional worker:** if the FastAPI ingestion worker is used, deploy it separately (e.g., Railway / Fly / Render) and have it write to Supabase; Vercel Cron or the worker's own `APScheduler` drives timing.
- **Env vars:** set in Vercel project settings and Supabase — never commit secrets (§21).
- **Promotion:** Phase 1 runs locally (`supabase start` + `npm run dev`); Phase 2.3 promotes to the hosted Vercel + Supabase production project.

---

## 21. Security & Secrets

- **No hardcoded secrets** — API keys (GitHub, Reddit, HF, X, OpenAI) and Supabase keys live in env vars; validate presence at startup. `.env` is gitignored; ship `.env.example`.
- **Supabase keys** — the **anon key** is the only key allowed client-side; the **service-role key** is server-side only (route handlers / worker) and never exposed to the browser.
- **Row Level Security (RLS)** — enable RLS on all user-scoped tables in Phase 2; write explicit policies so users only see their own preferences/feedback. `database-reviewer` checks policies.
- **Untrusted ingestion** — sanitize all fetched content before storing/rendering; no raw-HTML injection; guard `item-summarize` against prompt injection by wrapping/validating external text.
- **Phase 2 auth** — every auth/user-data change gets a `security-reviewer` pass before merge. CSRF on state-changing actions; rate-limit endpoints; production CSP + security headers (ECC web `security`).
- **Respect sources** — honor robots/ToS and rate limits; link-first ingestion keeps the footprint light.

---

## 22. Git & PRs

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
- Branch off `main`; never commit/push until **GATE 2** approval (§12.3).
- PR body links back to the slice's PRD + plan; Vercel preview URL attached automatically.

---

## 23. Quick Reference — Starting Any Work Here

1. Re-read the relevant section of this file **and the relevant `ECC/rules/` + `ECC/skills/` files** (§12.8). ⭐
2. **Run the `preference-checkpoint`** — ask the user what they want for this slice (§12.4). ⭐
3. Research & reuse; then `/plan-prd` → `/plan`. **GATE 1.**
4. Implement TDD in a thin vertical slice.
5. `/code-review` (+ `security-reviewer` if triggered).
6. Commit + PR. **GATE 2.**
7. Confirm the subphase outcome before moving on.
