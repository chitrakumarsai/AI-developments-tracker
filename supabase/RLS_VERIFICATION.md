# RLS Verification — Phase 2.2 cross-user isolation

Turnkey smoke test to **prove** the 2.2 Row Level Security once the migration is
applied to a live Postgres. RLS is a database feature — it cannot be exercised by
the unit suite (which mocks PostgREST), so this is the missing end-to-end proof
noted in PR #5. Run it after `20260705000001_phase2_rls.sql` is applied.

## Prerequisites

1. Migration applied: `supabase db push` (or the SQL editor) against the target project.
2. Two real auth users exist. Create them however is convenient:
   - Sign in twice through the app (owner email + a second email), **or**
   - Supabase Studio → Authentication → Add user (×2).
3. Note each user's UUID (`select id, email from auth.users;`) and set the owner's
   email in `OWNER_EMAIL`, then sign the owner in once so `syncProfileOnSignIn`
   upserts their `profiles` row with `role='owner'` and runs `claim_owner_data`.

Replace `:owner_id` and `:member_id` below with the two UUIDs.

## How the checks work

Supabase runs SQL as the `postgres` superuser, which **bypasses RLS**. To test as
a specific user we impersonate the `authenticated` role and set the JWT `sub`
claim that `auth.uid()` reads. Wrap each check in a transaction so the role reset
is local.

```sql
-- ===== Act as MEMBER =====
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":":member_id","role":"authenticated"}';

-- 1. Member sees ONLY their own feedback (0 rows that belong to the owner).
select count(*) as owner_rows_visible_to_member
from feedback where user_id = ':owner_id';           -- EXPECT: 0

-- 2. Member can read the shared catalog (anon+auth read policy).
select count(*) > 0 as can_read_sources from sources; -- EXPECT: true
select count(*) > 0 as can_read_items   from items;   -- EXPECT: true

-- 3. Member CANNOT write the source catalog (owner-only).
insert into sources (name, category, url, ingestion_type, status)
values ('hacker inject', 'x', 'https://evil.example', 'rss', 'active');
-- EXPECT: ERROR  new row violates row-level security policy for table "sources"
rollback;
```

```sql
-- ===== Act as MEMBER writing their OWN rows (should succeed) =====
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":":member_id","role":"authenticated"}';

insert into app_settings (user_id, top_per_source_day) values (':member_id', 5);  -- OK
insert into item_reads (user_id, item_id)
  select ':member_id', id from items limit 1;                                       -- OK

-- Cross-user write MUST fail the WITH CHECK:
insert into feedback (user_id, item_id, value)
  select ':owner_id', id, 'up' from items limit 1;
-- EXPECT: ERROR  new row violates row-level security policy for table "feedback"
rollback;
```

```sql
-- ===== Act as OWNER (catalog writes allowed) =====
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":":owner_id","role":"authenticated"}';

insert into sources (name, category, url, ingestion_type, status)
values ('owner add', 'Research Papers', 'https://example.com/feed', 'rss', 'active');
-- EXPECT: 1 row inserted (owner passes the profiles.role='owner' check)
rollback;
```

```sql
-- ===== Act as ANON (signed-out) =====
begin;
set local role anon;

select count(*) > 0 as anon_reads_sources from sources;  -- EXPECT: true
select count(*) > 0 as anon_reads_items   from items;    -- EXPECT: true
select count(*) as anon_sees_feedback from feedback;     -- EXPECT: 0 (no policy)
select count(*) as anon_sees_settings from app_settings; -- EXPECT: 0 (no policy)
rollback;
```

## Pass criteria

- [ ] Member sees 0 of the owner's feedback / saved_views / app_settings / item_reads.
- [ ] Member cannot insert/update/delete `sources` or `source_candidates`.
- [ ] Member CAN read `sources`/`items` and write their own per-user rows.
- [ ] A cross-user write (setting another `user_id`) is rejected by the WITH CHECK.
- [ ] Owner CAN write the source catalog.
- [ ] Anon reads `sources`/`items` but sees 0 rows in every per-user table.

If every box holds, cross-user isolation is proven and 2.2's headline is met.

## Owner backfill check (claim_owner_data)

After the owner's first sign-in, confirm the Phase-1 data was claimed exactly once:

```sql
select
  (select count(*) from app_settings where user_id = ':owner_id') as owner_settings,   -- 1 if a Phase-1 row existed
  (select count(*) from feedback     where user_id = ':owner_id') as owner_feedback,    -- = items with a Phase-1 feedback_value
  (select count(*) from item_reads   where user_id = ':owner_id') as owner_reads;       -- = items with Phase-1 read_state=true
```

Sign the owner in a second time and re-run: the counts must be **unchanged**
(idempotent — the one-time seed guards + `where user_id is null` claims prevent drift).
