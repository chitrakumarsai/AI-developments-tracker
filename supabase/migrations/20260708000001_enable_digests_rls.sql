-- 2.4 — Enable RLS on `digests` (fixes Supabase linter: rls_disabled_in_public).
--
-- `digests` is a server-side LLM summary cache. It was created in
-- 20260704000003_digests.sql, and the 2.2 migration (20260705000001_phase2_rls)
-- enabled RLS on every other public table but MISSED this one — so it shipped
-- with RLS OFF. Combined with the Phase-1 default privileges
-- (20260623000001_grants.sql: `alter default privileges ... grant select ... to
-- anon, authenticated`), the table was readable by anyone holding the anon key.
--
-- The app reads/writes `digests` ONLY via the service-role client
-- (lib/digest/digest.ts → getServerClient; the module is `import "server-only"`,
-- so it can never reach the browser). service_role bypasses RLS entirely and
-- keeps its `grant all`, so enabling RLS with NO anon/authenticated policy =
-- default-deny for every API-key role while the digest cache keeps working.

alter table digests enable row level security;

-- Defense in depth: drop EVERY table privilege these roles inherited from the
-- Supabase/Phase-1 default privileges. `digests` is a service-role-only cache —
-- nothing legitimately reads or writes it as anon/authenticated. With RLS on AND
-- no policy the row ops (select/insert/update/delete) already deny; revoking the
-- grants closes them even if a policy were later added, and drops TRUNCATE (which
-- RLS does NOT gate). service_role keeps its `grant all` and bypasses RLS, so the
-- cache writer (lib/digest/digest.ts) is unaffected.
revoke all on digests from anon, authenticated;
