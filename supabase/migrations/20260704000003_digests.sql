-- AI Chronicles — cached LLM "what happened this week/month" digests (app-feedback-v3).
--
-- A digest is generated from the top items in a window. To avoid paying for the
-- same summary twice, it's cached keyed by the period + a hash of the item-id
-- set: while the underlying items are unchanged the cached text is reused; when
-- new items arrive the hash changes and a fresh digest is generated. Cheap
-- gpt-4o-mini calls, but the cache keeps them rare.

create table if not exists digests (
  id         bigint generated always as identity primary key,
  period     text not null check (period in ('week', 'month')),
  item_hash  text not null,
  content    text not null,
  created_at timestamptz not null default now(),
  unique (period, item_hash)
);
