-- AI Chronicles — seed data for local development.
-- Research Papers: four arXiv category feeds (cs.AI, cs.LG, cs.CL, cs.CV).
-- Companies & Labs: official lab/company blog RSS feeds (1.2 slice 1).
-- All are ingestion_type='rss', run through the generic RSS connector.

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
  ),
  -- Companies & Labs — official blog RSS feeds (validated to fetch 2026-07-01).
  (
    'OpenAI — News',
    'Companies & Labs',
    'https://openai.com/news/rss.xml',
    'rss', 'active', 10,
    array['lab', 'openai', 'blog'],
    'OpenAI official news / announcements.'
  ),
  (
    'Google DeepMind — Blog',
    'Companies & Labs',
    'https://deepmind.google/blog/rss.xml',
    'rss', 'active', 10,
    array['lab', 'deepmind', 'blog'],
    'Google DeepMind research + product blog.'
  ),
  (
    'Hugging Face — Blog',
    'Companies & Labs',
    'https://huggingface.co/blog/feed.xml',
    'rss', 'active', 9,
    array['lab', 'huggingface', 'blog'],
    'Hugging Face blog — models, libraries, community.'
  ),
  (
    'Microsoft Research — Blog',
    'Companies & Labs',
    'https://www.microsoft.com/en-us/research/feed/',
    'rss', 'active', 8,
    array['lab', 'microsoft', 'blog'],
    'Microsoft Research blog.'
  ),
  (
    'BAIR — Berkeley AI Research',
    'Companies & Labs',
    'https://bair.berkeley.edu/blog/feed.xml',
    'rss', 'active', 7,
    array['lab', 'academia', 'blog'],
    'Berkeley AI Research blog.'
  );
