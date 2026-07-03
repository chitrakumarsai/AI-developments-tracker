-- AI Chronicles — add a GitHub forks count to items (subphase 1.4 slice B)
-- `metric` stays "stars" (drives the 1.5 star badge and Top-starred sort).
-- `forks` is a second, additive popularity signal blended into relevance ranking
-- as effective popularity = metric + forks. Null = source has no forks signal
-- (every non-GitHub source), so ranking treats absent forks as +0.

alter table items
  add column if not exists forks integer;
