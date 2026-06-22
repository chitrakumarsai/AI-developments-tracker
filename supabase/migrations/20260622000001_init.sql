-- Sonar — initial schema (Phase 1)
-- Core entities: sources, items, feedback, source_candidates, saved_views.
-- RLS is intentionally left OFF in Phase 1 (single-user, no auth).
-- Phase 2 adds users + enables RLS with per-user policies. See CLAUDE.md §11, §21.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type ingestion_type as enum ('rss', 'api', 'scrape', 'manual');
create type source_status   as enum ('active', 'paused', 'archived');
create type candidate_state as enum ('suggested', 'promoted', 'rejected');
create type feedback_value  as enum ('up', 'down');

-- ---------------------------------------------------------------------------
-- sources — the vetted, catalogued sources that feed the website
-- ---------------------------------------------------------------------------
create table sources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text not null,
  url              text not null,
  ingestion_type   ingestion_type not null default 'rss',
  status           source_status  not null default 'active',
  priority         integer not null default 0,           -- ranking weight
  refresh_interval interval not null default '1 day',
  tags             text[] not null default '{}',
  notes            text,
  added_on         timestamptz not null default now(),
  last_fetched     timestamptz
);

create index sources_status_idx   on sources (status);
create index sources_category_idx on sources (category);

-- ---------------------------------------------------------------------------
-- items — content surfaced from sources (link-first: metadata + link)
-- ---------------------------------------------------------------------------
create table items (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references sources (id) on delete cascade,
  title           text not null,
  author          text,
  summary         text,
  url             text not null,                          -- the primary payload
  category        text not null,
  tags            text[] not null default '{}',
  relevance_score double precision not null default 0,
  read_state      boolean not null default false,
  published_at    timestamptz,
  fetched_at      timestamptz not null default now(),
  unique (url)                                            -- dedupe on link
);

create index items_published_idx on items (published_at desc);
create index items_source_idx    on items (source_id);
create index items_category_idx  on items (category);

-- ---------------------------------------------------------------------------
-- feedback — thumbs up/down on items (feeds ranking + source re-weighting)
-- ---------------------------------------------------------------------------
create table feedback (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items (id) on delete cascade,
  value      feedback_value not null,
  created_at timestamptz not null default now()
);

create index feedback_item_idx on feedback (item_id);

-- ---------------------------------------------------------------------------
-- source_candidates — discovered but not-yet-promoted sources (rating gate)
-- ---------------------------------------------------------------------------
create table source_candidates (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  handle_or_url text not null,
  why_suggested text,
  sample_items  jsonb not null default '[]',
  rating        integer,
  state         candidate_state not null default 'suggested',
  created_at    timestamptz not null default now()
);

create index source_candidates_state_idx on source_candidates (state);

-- ---------------------------------------------------------------------------
-- saved_views — named filter presets (e.g. "Morning read")
-- ---------------------------------------------------------------------------
create table saved_views (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  filters    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
