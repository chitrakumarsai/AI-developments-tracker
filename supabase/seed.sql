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
  ),
  -- GitHub Repositories — notable AI repos via the Search API (1.2 slice 2).
  -- ingestion_type='api'; the GitHub connector injects a rolling pushed:>= date
  -- + stars sort at runtime. Topics here are editable via the catalog.
  (
    'GitHub — Notable AI repos',
    'GitHub Repositories',
    'https://api.github.com/search/repositories?q=topic:machine-learning+topic:llm+topic:agents',
    'api', 'active', 9,
    array['github', 'repos'],
    'Recently-active, most-starred repos in AI topics. Needs GITHUB_TOKEN.'
  ),
  -- Hugging Face — daily curated papers + trending models (1.2 slice 4).
  -- ingestion_type='api'; the HF connector dispatches by URL path. Token
  -- optional (public endpoints) but HUGGINGFACE_TOKEN raises rate limits.
  (
    'Hugging Face — Daily Papers',
    'Research Papers',
    'https://huggingface.co/api/daily_papers',
    'api', 'active', 9,
    array['huggingface', 'papers', 'curated'],
    'HF daily curated paper picks. Link-first to the HF paper page.'
  ),
  (
    'Hugging Face — Trending models',
    'LLM & Other Models',
    'https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=50',
    'api', 'active', 8,
    array['huggingface', 'models', 'trending'],
    'Trending models by HF trendingScore. Link-first to the model page.'
  ),
  -- Social / Discussion — AI-filtered high-score Hacker News stories via the
  -- Algolia HN Search API (1.2 slice 5). ingestion_type='api', keyless. Query +
  -- points threshold are catalog-tunable via sources.url. Text posts fall back
  -- to the HN discussion link.
  (
    'Hacker News — AI stories',
    'Social / Discussion',
    'https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=points>=100&hitsPerPage=50',
    'api', 'active', 7,
    array['hackernews', 'discussion', 'ai'],
    'High-score HN stories matching "AI". Link-first to the story or HN thread.'
  ),
  (
    'Hacker News — LLM stories',
    'Social / Discussion',
    'https://hn.algolia.com/api/v1/search?query=LLM&tags=story&numericFilters=points>=100&hitsPerPage=50',
    'api', 'active', 7,
    array['hackernews', 'discussion', 'llm'],
    'High-score HN stories matching "LLM". Widens AI coverage alongside the AI query.'
  );
