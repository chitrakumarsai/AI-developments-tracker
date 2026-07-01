-- Sonar — grant Supabase API roles access to the public schema (Phase 1).
--
-- The init migration creates the tables but does not grant privileges to the
-- Supabase API roles, so PostgREST requests (the service-role key used by
-- server-side ingestion/reads, and anon later) are denied. RLS stays OFF in
-- Phase 1 (single-user); Phase 2 enables RLS with per-user policies (§21).

grant usage on schema public to anon, authenticated, service_role;

-- Existing tables.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;

-- Future tables created by the migration owner inherit the same access.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select on tables to anon, authenticated;
