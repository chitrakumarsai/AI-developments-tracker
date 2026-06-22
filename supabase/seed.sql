-- Sonar — seed data for local development.
-- Seeds the first source (arXiv cs.AI) used by the 1.1 vertical slice.

insert into sources (name, category, url, ingestion_type, status, priority, tags, notes)
values (
  'arXiv — cs.AI',
  'Research Papers',
  'http://export.arxiv.org/rss/cs.AI',
  'rss',
  'active',
  10,
  array['ai', 'papers'],
  'Primary arXiv AI feed. First connector / pipeline template for Phase 1.'
);
