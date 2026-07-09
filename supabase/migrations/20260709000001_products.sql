-- AI Chronicles — `products`: personalized saved prompt-views (v4 Slice B).
--
-- A "product" is a user-authored prompt saved with a title. It surfaces under
-- the feed's Products tab → "My views" sub-view. Results are a MATERIALIZED
-- snapshot: at save/refresh time we semantic-search the item corpus and store
-- the matched item ids in `product_items`, so reopening a view is a cheap read
-- (no LLM call on the hot path). The prompt's embedding is stored on the row so
-- a refresh can re-rank against current items.
--
-- pgvector is enabled here so the semantic path is ready; the embedding-writing
-- code lands once the OpenAI quota is live. Until then rows can be created with
-- a null embedding and an empty snapshot (the UI shows an empty view).
--
-- Per-user + RLS from creation (Phase 2): every row is owned by its author and
-- only visible to them (mirrors saved_views / feedback in phase2_rls).

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- products — one saved prompt-view per row
-- ---------------------------------------------------------------------------
create table products (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  prompt     text not null,
  -- OpenAI text-embedding-3-small dimensionality; null until computed.
  embedding  vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_user_idx on products (user_id);

-- ---------------------------------------------------------------------------
-- product_items — the materialized snapshot: which items a view matched
-- ---------------------------------------------------------------------------
create table product_items (
  product_id uuid not null references products (id) on delete cascade,
  item_id    uuid not null references items (id)    on delete cascade,
  -- Display order within the view (0 = top); `score` keeps the raw similarity
  -- so a later re-rank/threshold has the signal. Both set at snapshot time.
  rank       integer not null default 0,
  score      real,
  created_at timestamptz not null default now(),
  primary key (product_id, item_id)
);

create index product_items_product_idx on product_items (product_id);

-- ---------------------------------------------------------------------------
-- RLS — per-user ownership (Phase 2). Mirrors saved_views_own: a user sees and
-- mutates only their own products; product_items inherit ownership through the
-- parent product. service_role bypasses RLS for server-side snapshot writes.
-- ---------------------------------------------------------------------------
alter table products      enable row level security;
alter table product_items enable row level security;

create policy products_own on products
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy product_items_own on product_items
  for all to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_items.product_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from products p
      where p.id = product_items.product_id
        and p.user_id = (select auth.uid())
    )
  );

-- Phase-1 default privileges grant `select` to authenticated; grant the write
-- ops too so an owner can create/refresh/delete their own views (RLS still gates
-- to their rows). service_role keeps `grant all` via default privileges.
grant insert, update, delete on products      to authenticated;
grant insert, update, delete on product_items to authenticated;
