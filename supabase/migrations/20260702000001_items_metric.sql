-- AI Chronicles — add a generic popularity metric to items (subphase 1.5)
-- One nullable integer that means "stars" for GitHub repos and "likes" for
-- Hugging Face models, so the feed can sort by popularity uniformly across
-- sources without per-source columns. Null = source has no metric.

alter table items
  add column if not exists metric integer;

-- Partial btree index supports "order by metric desc nulls last" for the
-- Top-starred sort; only rows that actually have a metric are indexed.
create index if not exists items_metric_idx
  on items (metric desc)
  where metric is not null;
