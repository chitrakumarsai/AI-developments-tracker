# Slice B (complete) — Prompt-views semantic search (v4 feedback #3)

**Branch:** `feat/v4.3-prompt-search` off `main` · **large** tier · TDD · two gates + security-reviewer (untrusted input + LLM).
**Preferences (locked 2026-07-09):** retrieve-then-rerank; `text-embedding-3-small` (1536); vector top ~60 → `gpt-4o-mini` rerank → top 20; manual Refresh per view.

## Pipeline
`prompt → embed → pgvector cosine top 60 over items → LLM rerank → top 20 → snapshot into product_items`

## Task order

### B1 — Embedding infrastructure (backend)
1. Migration `20260709000002_items_embedding.sql`: `alter table items add column embedding vector(1536)`; HNSW index `on items using hnsw (embedding vector_cosine_ops)`; RPC `match_items(query_embedding vector(1536), match_count int, exclude_null bool)` → items ordered by `embedding <=> query` asc, skipping null embeddings. Owner/service-role only (SECURITY DEFINER not needed; called via service client).
2. `lib/llm/openai.ts`: add `embed(inputs: string[]): Promise<number[][]>` — POST `/v1/embeddings`, model `text-embedding-3-small`, batched; injectable for tests; throws on missing key / HTTP error (mirrors `chatComplete`).
3. `lib/embeddings/itemText.ts`: `itemEmbedInput(item)` = sanitized `title + summary` (already sanitized at ingest; cap length). Pure + tested.
4. Embed-on-ingest: in `lib/ingestion/persist.ts`, after upsit of NEW items, batch-embed their text and `update items.embedding`. Failure = warning, never blocks ingest (embeddings are best-effort; backfill catches stragglers).
5. Backfill route `POST /api/embeddings/backfill` (owner-gated): embed all items with null embedding in batches; returns count. Idempotent.

### B2 — Create-from-prompt (search + rerank)
6. `lib/products/rerank.ts`: `rerankItems(prompt, candidates, complete)` → ordered item ids (≤20). Wraps candidate `{id,title,summary}` as clearly-delimited DATA (prompt-injection guard §12.7), instructs model to ONLY rank + return JSON id array, validates returned ids ⊆ candidate set, truncates to 20. Injectable `complete`; tested with a fake.
7. `lib/products/search.ts`: `buildSnapshot(prompt, {embed, rpc, complete})` → `{embedding, items:[{id,rank,score}]}`: embed prompt → `match_items` 60 → rerank → map to ranked rows. Tested with fakes (no network).
8. `lib/products/persist.ts`: `createProductFromPrompt(...)` — insert product (with prompt embedding) + insert product_items snapshot in one flow; `refreshProduct(id)` re-runs buildSnapshot and replaces product_items. Both owner-scoped. Tests.
9. API: `POST /api/products` (create: validate title+prompt with Zod, rate-limit, owner session) and `POST /api/products/[id]/refresh`. Reuse existing rate-limit + auth gate.

### B3 — UI (My views → real)
10. `getProductWithItems(id, userId, client)` in persist (join product_items→items by rank). Test.
11. Create form in `MyViews.tsx` (client): title + prompt → POST /api/products → refresh. Replaces the "soon" chip.
12. Per-view detail: `app/feed` My-views detail via `?section=products&view=mine&id=<id>` (or a route) — renders the snapshot with `ItemCard`, a Refresh button, and delete. Reuse ItemCard/context.

## Security (security-reviewer pass required)
- Prompt + candidate item text are untrusted → wrap as data, never as instructions; validate reranker output against candidate ids; Zod-validate the create body; rate-limit create/refresh; owner-only routes.
- Embeddings/rerank via service or auth-aware client server-side only; `OPENAI_API_KEY` server-side (never `NEXT_PUBLIC`).

## Verify
- Backfill → items have embeddings. Create a view "efficient inference on consumer GPUs" → snapshot surfaces semantically-related items (not just keyword hits). Refresh re-ranks. Empty/malformed prompt handled. Responsive.

## Gates
- GATE 1: this plan. GATE 2: diff + code-review + **security-reviewer** before commit.
