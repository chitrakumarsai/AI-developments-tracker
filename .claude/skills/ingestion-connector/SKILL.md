---
name: ingestion-connector
description: Add a new source connector (RSS/API/scrape/manual) to AI Chronicles by matching the existing link-first pattern — the Connector contract, the ingestion_type registry, shared sanitize + SSRF guard, and fixture-based tests. Use when wiring any new source type or provider.
metadata:
  origin: project (AI Chronicles) — adapts ECC api-connector-builder
---

# Ingestion Connector

Wire a new source into the catalog-driven pipeline **without inventing a second architecture** (ECC `api-connector-builder`). A new connector must look native next to `rss/rss.ts` and `api/github.ts`.

## When to Use

- Adding a new source **type** (`rss`, `api`, `scrape`, `manual`).
- Adding a new **provider** under an existing type (e.g. Hugging Face under `api`).

## The pattern (match it exactly)

1. **Contract** — implement `Connector` from `web/lib/ingestion/types.ts`: `(source: SourceRef) => Promise<IngestionResult>`. Return normalized `NormalizedItem[]` — **link-first**: metadata + `url` only, never full scraped bodies (CLAUDE.md §7).
2. **Split pure vs I/O** — a pure `parseX(payload, source)` mapper (fixture-testable, network-free) + the `connector` that fetches and calls it. See `parseRssFeed` / `parseGithubSearch`.
3. **Sanitize everything** — every text field through `sanitizeText`; every link through `sanitizeUrl`. All source content is untrusted (§12.7). Never render raw HTML.
4. **SSRF + fetch** — validate the fetch URL with `unsafeUrlReason` (`lib/ingestion/net.ts`); use the shared `USER_AGENT` + `FETCH_TIMEOUT_MS` (AbortController).
5. **Warn, don't throw** — a bad source returns `{ items: [], warnings: [...] }` so one failure never aborts a multi-source run.
6. **Register** — wire into `lib/ingestion/registry.ts` by `ingestion_type`. `rss` → one generic connector for all feeds. `api` → the host router (`api/router.ts`) that picks the provider by URL host. Add new API providers as a host branch there.
7. **Catalog-driven** — a new source should be a `sources` row, not code. Put provider-tunable bits (topics, query) in `sources.url`; compute volatile bits (rolling date windows) at runtime.
8. **Auth** — read tokens from `process.env` server-side only (never `NEXT_PUBLIC_*`). Missing token → warning, still attempt if the API allows unauth.

## Tests (match the style)

- Vitest, fixture-based. Save a real sample payload under `__fixtures__/`.
- Cover: happy mapping, field sanitization, skip-on-missing-url + warning, non-200 → warning, fetch-reject → warning, and (API) missing-token → warning.
- Keep ≥80% coverage on `lib/ingestion`.

## Checklist

- [ ] Implements `Connector`; pure mapper split out and fixture-tested
- [ ] `sanitizeText` / `sanitizeUrl` on all fields; no raw HTML
- [ ] `unsafeUrlReason` guard + shared UA/timeout
- [ ] Warns, never throws, on failure
- [ ] Registered by `ingestion_type` (RSS: generic; API: host router branch)
- [ ] New source works as a catalog row with no further code
- [ ] Token (if any) server-only; missing-token handled
- [ ] Live-verified; re-run dedupes to 0 (unique `url`)

## Reference implementations

- RSS: `web/lib/ingestion/rss/rss.ts` (+ `rss.test.ts`)
- API + host router: `web/lib/ingestion/api/github.ts`, `web/lib/ingestion/api/router.ts`
- Shared: `web/lib/ingestion/net.ts`, `web/lib/ingestion/sanitize.ts`, `web/lib/ingestion/persist.ts`
