-- 2.4 — Gate the feed at the data plane.
--
-- The 2.1 design served items/sources to `anon` (a public feed). 2.4 pivots to a
-- gated app plus a small PUBLIC landing teaser, so anonymous DB reads of the feed
-- must stop: the page redirect + /api/items 401 are cosmetic while the anon key
-- (shipped in the browser bundle) can still read the tables directly via
-- PostgREST. The landing teaser now reads via the SERVICE-ROLE client
-- (server-side, bypasses RLS, capped at 5), so no anon read path is needed.
--
-- After this migration:
--   • anon can read NEITHER items NOR sources (no grant AND no policy);
--   • authenticated users still read the shared catalog;
--   • owner still curates sources; items writes remain service-role only.

-- 1. Replace the anon+authenticated read policies with authenticated-only.
drop policy if exists sources_read_all on sources;
drop policy if exists items_read_all   on items;

create policy sources_read_auth on sources
  for select to authenticated using (true);
create policy items_read_auth on items
  for select to authenticated using (true);

-- 2. Revoke the table-level SELECT grant from anon (defense in depth: without the
--    grant anon cannot read even if a permissive policy were ever reintroduced).
--    Other per-user tables keep their anon grant but deny via authenticated-only
--    RLS, so anon already sees zero rows there — only items/sources were open.
revoke select on items   from anon;
revoke select on sources from anon;
