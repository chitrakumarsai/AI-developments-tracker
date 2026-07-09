-- AI Chronicles — item embeddings for semantic prompt-views (v4 Slice B, B1).
--
-- Adds a pgvector column to `items` and a `match_items` RPC so a saved
-- prompt-view can retrieve the most semantically-similar items (cosine), which
-- an LLM then reranks. pgvector was enabled in 20260709000001_products.sql.
--
-- Embeddings are `text-embedding-3-small` (1536 dims). They're written by the
-- ingest path (best-effort) and backfilled via /api/embeddings/backfill, so the
-- column is nullable and `match_items` skips rows without one.

alter table items add column if not exists embedding vector(1536);

-- HNSW cosine index: fast approximate nearest-neighbour over the embedding.
-- Rows with a null embedding are simply absent from the index.
create index if not exists items_embedding_idx
  on items using hnsw (embedding vector_cosine_ops);

-- Nearest-neighbour retrieval: the candidate pool for a prompt. `stable` (reads
-- only), returns full item rows so callers reuse the existing row shape. RLS on
-- `items` still applies to the invoker (items_read_all covers authenticated).
create or replace function match_items(
  query_embedding vector(1536),
  match_count int
)
returns setof items
language sql
stable
as $$
  select *
  from items
  where embedding is not null
  order by embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;

grant execute on function match_items(vector, int) to authenticated, service_role;
