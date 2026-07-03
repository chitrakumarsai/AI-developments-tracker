-- AI Chronicles — seed data for local development.
-- Research Papers: four arXiv category feeds (cs.AI, cs.LG, cs.CL, cs.CV).
-- Companies & Labs: official lab/company blog RSS feeds (1.2 slice 1).
-- Most sources are ingestion_type='rss' through the generic RSS connector;
-- arXiv/GitHub/HF/HN/Reddit are ingestion_type='api' (host-routed connectors).

insert into sources (name, category, url, ingestion_type, status, priority, tags, notes)
values
  -- arXiv — bounded API connector (1.4 slice B). Migrated RSS→api: the API lets
  -- us cap to the most-recent 50 per category (submittedDate desc) so a busy
  -- category can't flood the feed. Recency-only (no popularity metric).
  (
    'arXiv — cs.AI',
    'Research Papers',
    'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
    'api', 'active', 10,
    array['ai', 'papers'],
    'arXiv Artificial Intelligence. First connector / pipeline template for Phase 1.'
  ),
  (
    'arXiv — cs.LG',
    'Research Papers',
    'https://export.arxiv.org/api/query?search_query=cat:cs.LG',
    'api', 'active', 10,
    array['ml', 'papers'],
    'arXiv Machine Learning — highest-volume core ML feed.'
  ),
  (
    'arXiv — cs.CL',
    'Research Papers',
    'https://export.arxiv.org/api/query?search_query=cat:cs.CL',
    'api', 'active', 9,
    array['nlp', 'llm', 'papers'],
    'arXiv Computation & Language — NLP and large language models.'
  ),
  (
    'arXiv — cs.CV',
    'Research Papers',
    'https://export.arxiv.org/api/query?search_query=cat:cs.CV',
    'api', 'active', 8,
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
  -- FAANG + NVIDIA company blogs (1.2 slice 6). All ingestion_type='rss' through
  -- the generic connector; feeds validated to fetch 2026-07-02. AI-focused feeds
  -- get higher priority; general engineering blogs sit lower.
  (
    'Google Research — Blog',
    'Companies & Labs',
    'https://research.google/blog/rss/',
    'rss', 'active', 9,
    array['lab', 'google', 'research', 'blog'],
    'Google Research blog — AI/ML research announcements.'
  ),
  (
    'Google — The Keyword (AI)',
    'Companies & Labs',
    'https://blog.google/technology/ai/rss/',
    'rss', 'active', 8,
    array['google', 'product', 'ai', 'blog'],
    'Google product/AI announcements from The Keyword.'
  ),
  (
    'NVIDIA — Developer Blog',
    'Companies & Labs',
    'https://developer.nvidia.com/blog/feed/',
    'rss', 'active', 8,
    array['nvidia', 'gpu', 'deep-learning', 'blog'],
    'NVIDIA technical/developer blog — GPU + deep learning.'
  ),
  (
    'Amazon Science',
    'Companies & Labs',
    'https://www.amazon.science/index.rss',
    'rss', 'active', 8,
    array['amazon', 'research', 'blog'],
    'Amazon Science — research across ML, robotics, and more.'
  ),
  (
    'AWS — Machine Learning Blog',
    'Companies & Labs',
    'https://aws.amazon.com/blogs/machine-learning/feed/',
    'rss', 'active', 7,
    array['aws', 'ml', 'cloud', 'blog'],
    'AWS Machine Learning blog — applied ML on AWS.'
  ),
  (
    'Apple — Machine Learning Research',
    'Companies & Labs',
    'https://machinelearning.apple.com/rss.xml',
    'rss', 'active', 8,
    array['apple', 'research', 'blog'],
    'Apple Machine Learning Research publications and updates.'
  ),
  (
    'Meta — Engineering',
    'Companies & Labs',
    'https://engineering.fb.com/feed/',
    'rss', 'active', 6,
    array['meta', 'engineering', 'blog'],
    'Meta Engineering blog — includes AI/ML infra and research posts.'
  ),
  (
    'Netflix — Tech Blog',
    'Companies & Labs',
    'https://netflixtechblog.com/feed',
    'rss', 'active', 5,
    array['netflix', 'engineering', 'blog'],
    'Netflix Tech Blog — ML/personalization and platform engineering.'
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
  -- Algolia HN Search API (1.2 slice 5). ingestion_type='api', keyless. Query is
  -- catalog-tunable via sources.url; the high-score threshold is enforced in the
  -- connector (HN's Algolia index rejects numericFilters on points — only
  -- created_at_i is filterable). Text posts fall back to the HN discussion link.
  (
    'Hacker News — AI stories',
    'Social / Discussion',
    'https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=50',
    'api', 'active', 7,
    array['hackernews', 'discussion', 'ai'],
    'High-score HN stories matching "AI". Link-first to the story or HN thread.'
  ),
  (
    'Hacker News — LLM stories',
    'Social / Discussion',
    'https://hn.algolia.com/api/v1/search?query=LLM&tags=story&hitsPerPage=50',
    'api', 'active', 7,
    array['hackernews', 'discussion', 'llm'],
    'High-score HN stories matching "LLM". Widens AI coverage alongside the AI query.'
  ),
  -- Social / Discussion — top-of-month subreddit posts via Reddit's public
  -- top.json (1.4 slice B, expanded 1.4 slice C). ingestion_type='api', keyless
  -- (rate-limited by User-Agent). `t=month&limit=N` pre-sorts by score; the
  -- connector then applies the noise gate (drop < 50 upvotes, keep top 5/sub) so
  -- broader/noisier subs can't flood the feed. Link-first: external link post →
  -- its target; self post → the permalink discussion page. `score` is the metric.
  -- Priority nudges ranking: applied/technical subs above frontier/hype subs.
  (
    'Reddit — r/MachineLearning (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/MachineLearning/top.json?t=month&limit=25',
    'api', 'active', 7,
    array['reddit', 'discussion', 'ml'],
    'Top-of-month posts from r/MachineLearning. Link-first to the post or thread.'
  ),
  (
    'Reddit — r/LocalLLaMA (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/LocalLLaMA/top.json?t=month&limit=25',
    'api', 'active', 7,
    array['reddit', 'discussion', 'local-llm'],
    'Top-of-month posts from r/LocalLLaMA. Link-first to the post or thread.'
  ),
  (
    'Reddit — r/StableDiffusion (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/StableDiffusion/top.json?t=month&limit=25',
    'api', 'active', 7,
    array['reddit', 'discussion', 'image-gen', 'open-models'],
    'Applied/generative: open image models, tooling, workflows.'
  ),
  (
    'Reddit — r/OpenAI (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/OpenAI/top.json?t=month&limit=25',
    'api', 'active', 7,
    array['reddit', 'discussion', 'llm', 'products'],
    'OpenAI product/model news and discussion.'
  ),
  (
    'Reddit — r/comfyui (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/comfyui/top.json?t=month&limit=25',
    'api', 'active', 6,
    array['reddit', 'discussion', 'image-gen', 'tooling'],
    'ComfyUI workflows and node/tooling ecosystem.'
  ),
  (
    'Reddit — r/artificial (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/artificial/top.json?t=month&limit=25',
    'api', 'active', 6,
    array['reddit', 'discussion'],
    'Broad AI news and discussion. Noise gate keeps only high-vote items.'
  ),
  (
    'Reddit — r/singularity (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/singularity/top.json?t=month&limit=25',
    'api', 'active', 5,
    array['reddit', 'discussion', 'frontier'],
    'Frontier/AGI discussion — higher volume; noise gate is doing the work here.'
  ),
  (
    'Reddit — r/agi (top)',
    'Social / Discussion',
    'https://www.reddit.com/r/agi/top.json?t=month&limit=25',
    'api', 'active', 5,
    array['reddit', 'discussion', 'frontier'],
    'AGI-focused discussion — lower priority; noise gate trims weak posts.'
  ),
  -- Newsletters & Blogs — curated AI roundups via the generic RSS connector
  -- (1.4 slice C). ingestion_type='rss', keyless. Inherently low-noise (human
  -- curation), so no vote floor applies — the RSS connector's item cap is enough.
  -- Every feed URL was validated to resolve before seeding (§6). The Batch was
  -- dropped (no working public RSS) and replaced with Interconnects.
  (
    'Import AI (Jack Clark)',
    'Newsletters & Blogs',
    'https://importai.substack.com/feed',
    'rss', 'active', 8,
    array['newsletter', 'analysis', 'research'],
    'Weekly high-signal research + policy roundup by Jack Clark.'
  ),
  (
    'Interconnects (Nathan Lambert)',
    'Newsletters & Blogs',
    'https://www.interconnects.ai/feed',
    'rss', 'active', 8,
    array['newsletter', 'analysis', 'rlhf', 'open-models'],
    'Deep analysis on RLHF, open models, and frontier training (Nathan Lambert).'
  ),
  (
    'Ahead of AI (Sebastian Raschka)',
    'Newsletters & Blogs',
    'https://magazine.sebastianraschka.com/feed',
    'rss', 'active', 8,
    array['newsletter', 'analysis', 'ml', 'llm'],
    'Technical deep-dives on LLMs and ML research by Sebastian Raschka.'
  ),
  (
    'Last Week in AI',
    'Newsletters & Blogs',
    'https://lastweekin.ai/feed',
    'rss', 'active', 7,
    array['newsletter', 'roundup'],
    'Weekly roundup of the biggest AI news and research.'
  ),
  (
    'TLDR AI',
    'Newsletters & Blogs',
    'https://tldr.tech/api/rss/ai',
    'rss', 'active', 6,
    array['newsletter', 'roundup', 'daily'],
    'Daily bite-sized AI news digest.'
  );
