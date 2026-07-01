-- Sonar — seed data for local development.
-- Seeds the four arXiv category feeds used by the 1.1 vertical slice
-- (cs.AI, cs.LG, cs.CL, cs.CV). Each is a separate RSS source.

insert into sources (name, category, url, ingestion_type, status, priority, tags, notes)
values
  (
    'arXiv — cs.AI',
    'Research Papers',
    'https://rss.arxiv.org/rss/cs.AI',
    'rss', 'active', 10,
    array['ai', 'papers'],
    'arXiv Artificial Intelligence. First connector / pipeline template for Phase 1.'
  ),
  (
    'arXiv — cs.LG',
    'Research Papers',
    'https://rss.arxiv.org/rss/cs.LG',
    'rss', 'active', 10,
    array['ml', 'papers'],
    'arXiv Machine Learning — highest-volume core ML feed.'
  ),
  (
    'arXiv — cs.CL',
    'Research Papers',
    'https://rss.arxiv.org/rss/cs.CL',
    'rss', 'active', 9,
    array['nlp', 'llm', 'papers'],
    'arXiv Computation & Language — NLP and large language models.'
  ),
  (
    'arXiv — cs.CV',
    'Research Papers',
    'https://rss.arxiv.org/rss/cs.CV',
    'rss', 'active', 8,
    array['vision', 'multimodal', 'papers'],
    'arXiv Computer Vision — vision and multimodal.'
  );
