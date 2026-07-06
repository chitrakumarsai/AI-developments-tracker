-- AI Chronicles — Phase 2.2: per-user data + Row Level Security.
--
-- Turns the single shared data plane (Phase 1) into per-account personalization
-- enforced at the database. Decisions locked in the 2.2 preference-checkpoint:
--   • profiles table carries the owner/member role (owner from OWNER_EMAIL).
--   • sources/items get anon+auth READ (feed reads leave the service-role path);
--     source writes are owner-only; item writes stay service-role (ingestion).
--   • feedback / saved_views / app_settings / read-state become per-user.
--   • Phase-1 rows are claimed by the owner on first sign-in (see note below),
--     NOT in this migration — auth.users is empty at migration time.
--
-- read-state note: Phase 1 stored read-state as a GLOBAL boolean column on
-- `items` (items.read_state). That can't be per-user, so this migration adds an
-- `item_reads(user_id, item_id)` join table; the global column is left in place
-- (unused by the per-user path) and may be dropped in a later cleanup.
--
-- Backfill note: because auth.users has no rows until someone signs in, the
-- owner-claim of orphaned Phase-1 rows (user_id IS NULL) runs server-side via the
-- service-role client the first time the OWNER_EMAIL account authenticates. RLS
-- makes NULL-owner rows invisible to every authenticated user, so the claim MUST
-- use service-role (which bypasses RLS). See lib/auth on the app side.

-- ---------------------------------------------------------------------------
-- 1. profiles — identity + role (owner vs member)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A user may READ only their own profile (to show role in the UI). There is no
-- insert/update/delete policy for authenticated → default-deny: profile creation
-- and role assignment happen ONLY server-side via the service-role client, so a
-- member can never self-elevate to owner.
create policy profiles_select_own on profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Per-user ownership on personalization tables
-- ---------------------------------------------------------------------------
alter table feedback
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table saved_views
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists feedback_user_idx    on feedback (user_id);
create index if not exists saved_views_user_idx on saved_views (user_id);

-- One like per (user, item): prevents duplicate votes and lets upserts key cleanly.
create unique index if not exists feedback_user_item_key on feedback (user_id, item_id);

-- app_settings: singleton (id = 1) → one row per user. Drop the singleton PK and
-- id=1 check (names guarded with IF EXISTS), then DROP the now-vestigial `id`
-- column entirely and key by a unique user_id instead. (Dropping the PK does NOT
-- clear the column's NOT NULL flag, so a leftover `id` would reject every new
-- per-user insert — dropping the column avoids that trap.) The existing seeded
-- row keeps user_id NULL until the owner claims it on first sign-in.
alter table app_settings drop constraint if exists app_settings_pkey;
alter table app_settings drop constraint if exists app_settings_id_check;
alter table app_settings drop column if exists id;
alter table app_settings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
create unique index if not exists app_settings_user_key on app_settings (user_id);

-- ---------------------------------------------------------------------------
-- 3. item_reads — per-user read-state (replaces the global items.read_state)
-- ---------------------------------------------------------------------------
create table if not exists item_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists item_reads_user_idx on item_reads (user_id);

-- ---------------------------------------------------------------------------
-- 4. Grants — authenticated users write their own personalization rows
-- ---------------------------------------------------------------------------
-- Phase 1 granted only SELECT to authenticated (all writes went via service_role).
-- The per-user tables now take writes from the signed-in user's client; RLS below
-- restricts those writes to their own rows.
grant insert, update, delete on feedback     to authenticated;
grant insert, update, delete on saved_views  to authenticated;
grant insert, update, delete on app_settings to authenticated;
grant insert, update, delete on item_reads   to authenticated;
grant select on item_reads to authenticated;
grant select on profiles   to authenticated;
-- Owner curates the catalog from the authenticated client (RLS gates to owner).
grant insert, update, delete on sources           to authenticated;
grant insert, update, delete on source_candidates to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security policies
-- ---------------------------------------------------------------------------
-- Helper predicate (inlined): the current user is the owner.
--   exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner')

-- --- Global catalog: anon + authenticated READ ----------------------------
alter table sources enable row level security;
alter table items   enable row level security;

create policy sources_read_all on sources
  for select to anon, authenticated using (true);
create policy items_read_all on items
  for select to anon, authenticated using (true);

-- Source catalog writes: owner only. (items writes: no policy → service-role only.)
create policy sources_insert_owner on sources
  for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'));
create policy sources_update_owner on sources
  for update to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'))
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'));
create policy sources_delete_owner on sources
  for delete to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'));

-- --- source_candidates: owner only (read + write) -------------------------
alter table source_candidates enable row level security;
create policy candidates_owner_all on source_candidates
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'))
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'owner'));

-- --- Per-user tables: a user sees and writes only their own rows ----------
alter table feedback     enable row level security;
alter table saved_views  enable row level security;
alter table app_settings enable row level security;
alter table item_reads   enable row level security;

create policy feedback_own on feedback
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_views_own on saved_views
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy app_settings_own on app_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy item_reads_own on item_reads
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Note: service_role bypasses RLS entirely — ingestion (items writes) and the
-- server-side owner-claim/backfill continue to work unchanged.

-- ---------------------------------------------------------------------------
-- 6. claim_owner_data — one-time, idempotent owner backfill
-- ---------------------------------------------------------------------------
-- Runs server-side (service-role) the first time the OWNER_EMAIL account signs
-- in, once its profile exists. Assigns the Phase-1 shared data to the owner:
--   • feedback + read-state are SEEDED FROM the Phase-1 global columns
--     (items.feedback_value / items.read_state) — the single source of truth for
--     the current vote/read. We deliberately do NOT claim the append-only
--     `feedback` history rows: there can be several per item, which would violate
--     the new unique(user_id, item_id). Seeding from the denormalized column
--     yields exactly one row per item.
--   • saved_views + the app_settings singleton are claimed by nulling→owner.
-- Idempotent: ON CONFLICT DO NOTHING and `where user_id is null` make re-runs a
-- no-op, so calling it on every owner sign-in is safe.
create or replace function claim_owner_data(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Defense in depth: only ever backfill to a real owner profile, even though
  -- EXECUTE is already restricted to service_role.
  if not exists (select 1 from profiles where id = p_owner and role = 'owner') then
    raise exception 'claim_owner_data: % is not an owner profile', p_owner;
  end if;

  -- Seed per-user feedback/read-state from the frozen Phase-1 global columns, but
  -- ONLY the first time (guard on "owner has no rows yet"). Phase 2 stops writing
  -- items.feedback_value/read_state, so this snapshot is frozen — but the guard
  -- makes re-runs a strict no-op regardless, so a later sign-in can never
  -- re-seed or misattribute a value the owner has since cleared.
  if not exists (select 1 from feedback where user_id = p_owner) then
    insert into feedback (user_id, item_id, value)
    select p_owner, id, feedback_value
    from items
    where feedback_value is not null
    on conflict (user_id, item_id) do nothing;
  end if;

  if not exists (select 1 from item_reads where user_id = p_owner) then
    insert into item_reads (user_id, item_id)
    select p_owner, id
    from items
    where read_state = true
    on conflict (user_id, item_id) do nothing;
  end if;

  -- Claim the pre-auth saved views + settings singleton (idempotent: NULL only).
  update saved_views  set user_id = p_owner where user_id is null;
  update app_settings set user_id = p_owner where user_id is null;
end;
$$;

-- Only the server-side service-role caller may run the backfill.
revoke all on function claim_owner_data(uuid) from public;
grant execute on function claim_owner_data(uuid) to service_role;
