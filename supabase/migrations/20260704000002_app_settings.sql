-- AI Chronicles — app-wide feed settings (app-feedback-v3).
--
-- Phase 1 is single-user, so settings live in ONE global row (a singleton
-- enforced by `id = 1`). Phase 2 makes settings per-user by adding `user_id`
-- + RLS — the column shape stays the same, so no rework. The service_role key
-- (server-side) reads/writes this; default privileges from the grants migration
-- already cover new tables.
--
-- Columns:
--   top_per_source_day  max items each source may show per day (null = unlimited)
--   include_keywords    keep only items matching ANY of these (empty = no include filter)
--   exclude_keywords    drop items matching ANY of these
--   min_metric          hide items whose popularity metric is below this (null = no floor)

create table if not exists app_settings (
  id                 smallint primary key default 1 check (id = 1),
  top_per_source_day integer check (top_per_source_day is null or top_per_source_day > 0),
  include_keywords   text[] not null default '{}',
  exclude_keywords   text[] not null default '{}',
  min_metric         integer check (min_metric is null or min_metric >= 0),
  updated_at         timestamptz not null default now()
);

-- Seed the singleton with sensible defaults: cap 10 items per source per day
-- (directly addresses the "don't overwhelm me / too many arXiv & Reddit" feedback).
insert into app_settings (id, top_per_source_day)
  values (1, 10)
  on conflict (id) do nothing;
