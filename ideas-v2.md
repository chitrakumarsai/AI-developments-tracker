# AI Developments Tracker — Ideas v2

## Problem Statement

The AI field evolves at an overwhelming pace — new research papers, GitHub repositories, products, and models drop weekly. Staying current requires monitoring too many platforms simultaneously (X.com, LinkedIn, Reddit, arXiv, conferences, company blogs), making it practically impossible for a single person to keep up without falling behind.

---

## Vision

A single, personalized website that aggregates everything happening in AI that *I* find relevant — a personal AI radar, not a generic news feed.

### The Core Insight: Signal, Not Noise

The real problem isn't lack of information — it's **noise and distraction**. When I open X.com or LinkedIn to read *one* important thing, I get pulled into an endless feed and lose focus. The question is never "is there content?" — it's **"what is the one thing worth reading right now?"**

This tool answers that question. It does the watching across all platforms, surfaces only what matters, and points me straight to it — so I can read that single article or paper at the source without wading through the feed. The website is the **filter and the index**; the original platforms remain the place I actually read.

---

## Content Categories

These are the high-level buckets of information the website should track. Each category is fed by one or more concrete *sources* (see the next section).

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

## Sources to Track (Expanded)

> The quality of the website is only as good as the quality of its sources. This is the most important asset in the project — treated as first-class, curated data, not hardcoded values.

This is a **starter catalog**, not a final list. It will grow and shrink over time through the Source Catalog System below.

### Research Papers & Preprints
- **arXiv** — cs.AI, cs.LG, cs.CL, cs.CV, cs.NE, stat.ML (per-category feeds)
- **Papers with Code** — trending papers + SOTA leaderboards
- **OpenReview** — conference submissions and reviews
- **Semantic Scholar** — citation-aware discovery
- **Hugging Face Papers** — daily curated paper picks
- **bioRxiv / medRxiv** — for AI-in-bio crossover (optional)

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
- Their **official blogs + release notes + changelogs** (often available as RSS)

### Social & Discussion
- **X.com** — curated list of accounts (researchers, labs, builders); specific lists rather than the full feed
- **LinkedIn** — selected people and company pages
- **Reddit** — r/MachineLearning, r/LocalLLaMA, r/artificial, r/StableDiffusion, r/OpenAI, r/singularity (filtered)
- **Hacker News** — AI-tagged / high-score stories
- **Discord / Slack communities** — (optional, harder to ingest)

### Newsletters & Written Roundups
- Import Note (Jack Clark), The Batch (DeepLearning.AI), Last Week in AI, AI News (smol.ai), TLDR AI, Ahead of AI (Sebastian Raschka), The Sequence, Hugging Face Daily

### Video & Audio
- YouTube channels (Yannic Kilcher, Two Minute Papers, lab talk uploads, conference recordings)
- Podcasts (Latent Space, Dwarkesh, The TWIML AI Podcast, No Priors)

### Industry, Funding & Policy
- TechCrunch AI, The Information, VentureBeat AI, funding trackers (Crunchbase signals)
- Policy/regulation trackers (EU AI Act updates, US executive actions) — optional

> **Did I miss anything?** Possible additions to discuss: **patents** (USPTO AI filings), **Google Scholar alerts** for specific authors, **product directories** (Product Hunt AI, There's An AI For That), **GitHub Awesome-lists**, and **academic lab pages** for groups I follow.

---

## Source Discovery & Vetting System

> A platform like X, LinkedIn, or Reddit is not *one* source — it's thousands of potential sources buried in noise. Before anything is scraped, we need a system that answers: **"Within this noisy site, *who* and *what* is actually worth following?"** — and then lets me approve it.

This is a distinct system from the catalog. The catalog manages sources we've *accepted*; this system **finds and vets candidates** before they get there.

### The problem it solves

I can't manually audit all of X or Reddit. For each platform I need help identifying the relevant *places within it* — the specific accounts, subreddits, hashtags, lists, or pages where the signal actually lives — instead of subscribing to the whole firehose.

### How discovery works (per platform)

The system surfaces **candidate sub-sources** using platform-appropriate signals:

| Platform | What the system surfaces | Discovery signals |
|---|---|---|
| **X.com** | Specific accounts & curated lists | Accounts frequently cited by people I already trust, high signal-to-post ratio, followed-by-many-researchers, authors of papers I liked |
| **LinkedIn** | People & company pages | Researchers/founders posting substantive AI content, companies whose posts get shared in my circles |
| **Reddit** | Subreddits & high-karma contributors | Subreddits with consistent technical discussion, threads/users that repeatedly produce quality |
| **GitHub** | Orgs, users, topics | Authors of trending repos, orgs behind models I track |
| **YouTube / Podcasts** | Channels & shows | Recurring uploads of talks, interviews, technical explainers |
| **Blogs / Newsletters** | Specific feeds | Linked repeatedly by other trusted sources |

> A strong cross-platform signal: **the people and outlets that my already-trusted sources keep referencing.** Discovery can follow these citation/mention trails to suggest new candidates.

### The rating gate (human-in-the-loop curation)

Discovery only *proposes*. **I decide.** The system presents candidate sources and asks me to **rate them**, and only the top-rated candidates get promoted into the live catalog.

- For each candidate, the system shows: who/what it is, a few sample items, and why it was suggested.
- I give a **quality rating** (e.g., 1–5 stars, or a simple keep / skip / maybe).
- **Only top-rated candidates are promoted** to `active` in the Source Catalog and start feeding the website.
- Low-rated candidates are dropped or kept in a "suggested" backlog for later reconsideration.
- This rating becomes the source's initial `priority` / `weight` in the catalog.

> This keeps me firmly in control of quality. The website only ever shows content from sources I've explicitly vetted and rated highly — noise never makes it in by default.

### The full source pipeline

```
Discover candidates   →   I rate them   →   Promote top-rated   →   Catalog   →   Ingest
(find signal in the       (keep/skip/        (only high-rated      (manage      (RSS/API/
 noise, per platform)      star rating)        become active)       sources)     link)
```

### Where this lives in the plan

- **Phase 1:** lightweight — discovery can start semi-manual (I paste a platform/topic, the system suggests candidates; I rate them in a simple list). Even a curated seed list + rating step is enough to start.
- **Later:** smarter automated discovery (citation/mention-trail analysis, periodic "new candidates to review" digest) surfaced through the Source Management UI.

---

## Source Catalog System

Sources are managed data, not code. The website needs a robust system to **list, describe, and maintain** them.

### Each source is a structured record

A source entry should capture at least:

| Field | Purpose |
|---|---|
| `id` | Stable unique identifier |
| `name` | Human-readable name |
| `category` | Which content category it feeds |
| `url` | The source location (feed, page, API, or profile) |
| `ingestion_type` | How it's pulled — `rss`, `api`, `scrape`, or `manual` |
| `status` | `active`, `paused`, or `archived` |
| `priority` / `weight` | Influences ranking and how prominently items surface |
| `refresh_interval` | How often this specific source is checked |
| `tags` | Free-form labels for filtering (e.g., `nlp`, `vision`, `local-llm`) |
| `added_on` / `last_fetched` | Provenance and freshness tracking |
| `notes` | Why this source matters / what to expect from it |

### Source lifecycle (editing & curation)

Sources change relevance over time, so the catalog must be **fully editable**:

- **Add** a new source at any time (with validation that the URL/feed actually works).
- **Pause** a source temporarily without losing its history.
- **Archive / remove** a source that has become noisy or irrelevant — soft-delete preferred, so it can be restored.
- **Re-weight** a source up or down based on how useful its items turn out to be.
- **Review periodically** — a lightweight recurring check to prune dead or low-signal sources.

> Long term, source weighting can be informed by the feedback loop: sources whose items I consistently thumbs-up get boosted; sources I consistently ignore get demoted or flagged for review.

### Where this lives in the plan

- **Phase 1:** sources defined in a simple editable store (config file or DB table) with manual add/edit/remove.
- **Later:** a small in-app **Source Management UI** to add, pause, re-weight, and archive sources without touching code.

---

## Ingestion Strategy: Link-First, Not Scrape-Everything

> Key clarification: the goal is **surfacing the right thing to read**, not republishing content. We do **not** need to scrape and store full article bodies.

### The principle

The website's job is to tell me *"this is the one thing worth reading"* and link me straight to it. I'll read the full piece at the original source. So for most items, capturing **metadata + a link** is enough:

- Title
- Source & author
- Short summary or snippet (if cheaply available)
- Published date
- **Direct link to the original** (the primary payload)

This avoids the legal, technical, and maintenance burden of full scraping, and respects the original platforms.

### Ingestion methods, in order of preference

1. **Official feeds (RSS / Atom)** — cleanest, most stable; most blogs, arXiv, Reddit, YouTube, and many newsletters offer these.
2. **Official APIs** — GitHub, Hugging Face, Reddit, arXiv, YouTube, X (where access allows).
3. **Lightweight metadata scraping** — only title/link/date from a page when no feed or API exists.
4. **Manual entry** — for high-value sources that resist automation, I can add an item by pasting a link.

> Full-content scraping is a deliberate *exception*, only when reading inline genuinely adds value and the source permits it — decided per-source during planning.

### Why this matters for the noise problem

Because the tool only needs to surface **the link and just enough context to decide**, it can stay fast, lightweight, and focused on its real job: being the **filter** that replaces doomscrolling. I go to X or LinkedIn with intent — read the one thing, then leave.

---

## Core Features

### 1. Aggregation
- Pull content from multiple sources into one place
- Filter to only what's relevant — not everything, just the signal

### 2. Personalization & Feedback Loop
- Simple thumbs up / thumbs down on individual items
- System learns preferences over time and adjusts what's surfaced
- More detail on the feedback mechanism to be defined during development

### 3. Filtering & Display Controls
The website must let me slice the feed down to exactly what I want to see at any moment, so I can focus on one type of content without the rest getting in the way.

**Filter dimensions:**
- **By category** — show only Research Papers, only GitHub repos, only Models, etc. (any combination)
- **By source** — show only items from specific sources (e.g., only arXiv, only a given X list)
- **By platform** — X, LinkedIn, Reddit, GitHub, blogs, etc.
- **By tag / topic** — `nlp`, `vision`, `local-llm`, `agents`, `rl`, etc.
- **By time window** — today, last 2 days, this week, custom range
- **By rating / priority** — show only items from top-rated/high-weight sources
- **By feedback state** — hide items I've already thumbs-downed; optionally show only liked / unseen items
- **By read state** — unread vs. already-opened

**Display & interaction:**
- **Search** — free-text search across titles/summaries
- **Sort** — newest first, highest source priority, or most-relevant-to-my-preferences
- **Combine filters** — multiple filters apply together (e.g., "Research Papers + `vision` + this week + top-rated")
- **Saved filter views** — save common combinations as quick presets (e.g., a "Morning read" view)
- **Mobile-first filtering** — filters must be fast and thumb-friendly on the phone, not buried in a desktop-only sidebar
- **Clear empty/active states** — always show which filters are active and an easy way to reset

> Filters operate on the structured metadata captured during ingestion (category, source, tags, date, rating, feedback state), so the system can be built incrementally as those fields become available.

### 4. Content Refresh
- Refresh frequency: once a day or once every two days
- Exact schedule to be decided during planning phase

### 5. Naming
- The website needs a strong, memorable name
- To be decided — open to ideas

---

## UI / UX & Design Requirements

- **Extremely modern interface** — opinionated and polished, not a generic template look
- **Extremely user-friendly** — low friction, content-first, easy to scan quickly
- **Mobile-first, not just responsive** — I'll often read this while travelling or on my phone, so the mobile experience is the **top priority**, not an afterthought
- **Works seamlessly across breakpoints** — phone, tablet, laptop, desktop
- Fast load times and smooth interactions even on mobile networks
- Touch-friendly controls — thumbs up/down, filters, and navigation should all work well by thumb

---

## User Scope

| Phase | Auth | Users |
|---|---|---|
| **v1** | No authentication | Single user (me only) |
| **v2** | User authentication | Multiple users, each with their own preferences and personalized feed |

---

## Development Philosophy

Grounded in the **Everything Claude Code (ECC)** best practices found in the `ECC/` folder.

- **Plan before building** — never implement without a roadmap. Nothing gets coded until it has been planned and approved.
- **Build in thin vertical slices** — ship one complete end-to-end path first (e.g., *one* source → stored → displayed on mobile), not "all the backend, then all the frontend." Each slice is independently runnable and reviewable. *(ECC: `orch-build-mvp`)*
- **Incremental feature growth** — start with the simplest working version, then layer features on top one at a time. Resist building everything at once.
- **Gated, not autonomous** — every slice passes through two human checkpoints: **Gate 1** (approve the plan) and **Gate 2** (approve before commit). *(ECC: `orch-pipeline`)*
- **Right-size the ceremony** — small changes get a light process; large or cross-cutting ones get the full pipeline.
- **Research & reuse first** — before writing new code, search for proven libraries and implementations (GitHub, package registries, vendor docs). Prefer adopting battle-tested solutions. *(ECC: `development-workflow`)*

---

## Two-Phase Delivery Model

Product development runs in **two macro-phases**, each broken into **subphases**. We do not move to the next subphase until the current one is working and approved.

### Phase 1 — Development (local, single-user, no auth)

The goal of Phase 1 is a working website running locally that *I* can use daily.

| Subphase | Focus | Outcome |
|---|---|---|
| **1.0 — Planning** | Write the PRD and the project roadmap. Lock the tech stack. Define the data model and source list. No code yet. | Approved planning docs (PRD + roadmap + architecture) |
| **1.1 — First vertical slice** | One source (e.g., arXiv *or* GitHub trending) → fetched → stored → displayed in a clean, mobile-first list. Scheduled refresh stubbed/manual. | A running website showing real AI content from one source |
| **1.2 — More sources** | Add the remaining content categories one at a time (papers, repos, models, companies, people, X, LinkedIn, Reddit, products, conferences). | Aggregation across all core categories |
| **1.3 — Scheduled refresh** | Automate the daily / two-day content refresh. | Content stays current without manual action |
| **1.4 — Feedback loop** | Thumbs up / down on items; basic preference-aware ranking. | The feed adapts to what I like |
| **1.5 — UI/UX polish** | Modern, opinionated design; high mobile-friendliness; smooth interactions; accessibility pass. | A website that feels great on the phone |

### Phase 2 — Production (deployed, multi-user, authenticated)

The goal of Phase 2 is to take the proven product live for other users.

| Subphase | Focus | Outcome |
|---|---|---|
| **2.0 — Production planning** | Plan deployment, hosting, secrets management, monitoring, and the auth model. | Approved production rollout plan |
| **2.1 — Authentication** | Add user accounts and login. | Individual users can sign in |
| **2.2 — Per-user preferences** | Store each user's preferences and feedback; personalize their feed. | Every user gets a feed tuned to them |
| **2.3 — Deployment & hardening** | Deploy to production; security review; performance tuning for mobile networks. | Live, secure, fast website |
| **2.4 — Discoverability & growth** | SEO, sharing, onboarding for new users. | Others can find and use the site |

> Each subphase is itself delivered as one or more thin vertical slices, run through the ECC pipeline below.

---

## Per-Slice Workflow (ECC Pipeline)

Every slice — in either phase — follows the same gated path. This maps directly to ECC commands and the markdown-staged planning pattern.

```
/plan-prd  →  /plan  →  tdd-workflow  →  /code-review  →  /pr
 (why?)       (how?)     (build, test)    (quality gate)   (ship)
   │            │                              │
 PRD.md      plan.md                      review notes
            [GATE 1: approve plan]   [GATE 2: approve before commit]
```

1. **Research & Reuse** — look for existing implementations and libraries first.
2. **Plan** — `planner` / `architect` produces an ordered task list of thin slices → **Gate 1**.
3. **Implement (TDD)** — red → green → refactor for each task.
4. **Review** — `code-reviewer` (add `security-reviewer` for anything touching auth or user data).
5. **Commit & PR** — conventional commits, one per logical chunk → **Gate 2**.

> Planning artifacts live as committable markdown under `.claude/prds/`, `.claude/plans/`, and `.claude/reviews/`, so intent travels with the code and work is resumable across sessions. *(ECC: PLAN-PRD-PATTERN)*

---

## Tooling Plan: ECC Skills & Sub-Agents

Before building, decide which ECC skills and sub-agents to lean on. These are available globally and should be used deliberately at each stage. (Final selection to be confirmed once the tech stack is locked in during planning.)

### Skills to Use

| Stage | Candidate Skills | Purpose |
|---|---|---|
| Planning | `/plan`, `/plan-prd`, `feature-dev` | Roadmap, PRD, and structured feature breakdown |
| Frontend design | `frontend-design-direction`, `design-system`, `taste`, `make-interfaces-feel-better` | Lock a modern, opinionated visual direction |
| Frontend build | `react-patterns`, `frontend-patterns`, `vite-patterns` / `nextjs-turbopack` | Build the UI on a proven stack |
| Mobile & motion | `motion-ui`, `motion-foundations`, `frontend-a11y`, `accessibility` | Smooth, touch-friendly, accessible mobile-first UX |
| Backend | `fastapi-patterns`, `python-patterns`, `backend-patterns` | Aggregation API and services |
| Data | `postgres-patterns`, `database-migrations` | Store content, preferences, and feedback |
| Testing | `react-test`, `python-testing`, `e2e-testing`, `browser-qa` | Unit, integration, and end-to-end coverage |
| Quality & security | `/code-review`, `security-scan`, `security-review` | Review gates before merge |
| Deployment | `deployment-patterns`, `docker-patterns` | Move from dev to production |
| Discoverability | `seo` | Make the site indexable (relevant once multi-user) |

### Sub-Agents to Use

| Sub-Agent | Role in this project |
|---|---|
| `planner` | Turn this document into a phased implementation plan |
| `architect` / `code-architect` | System design, data model, and aggregation pipeline architecture |
| `react-reviewer` | Review frontend (React/JSX) changes |
| `a11y-architect` | Ensure accessibility and mobile usability standards |
| `performance-optimizer` | Keep the site fast on mobile networks |
| `fastapi-reviewer` / `python-reviewer` | Review backend code |
| `database-reviewer` | Review schema and queries |
| `security-reviewer` | Audit before each release (critical once auth is added in v2/v3) |
| `e2e-runner` | Drive end-to-end tests across key user flows |
| `code-reviewer` | General quality pass on all changes |

> Note: A backend stack (Python/FastAPI assumed given the existing `main.py` and `pyproject.toml`) and a frontend stack (React-based assumed) still need to be confirmed during planning. The skill/agent list above will be finalized then.
