-- Local research notes are never included in model requests.
CREATE TABLE IF NOT EXISTS research_notes (
 article_id INTEGER PRIMARY KEY REFERENCES articles(id),
 note TEXT NOT NULL DEFAULT '', horizon TEXT NOT NULL DEFAULT 'long',
 saved INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- 信源表（注：实际信源配置以 sources.json 为准，本表预留结构化信源元数据）
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT UNIQUE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,           -- 'rss' | 'website' | 'wechat' | 'manual'
    config_json TEXT,
    priority INTEGER DEFAULT 2,
    enabled INTEGER DEFAULT 1,
    source_tier TEXT DEFAULT 'media', -- 'official' | 'media' | 'community'
    is_primary INTEGER DEFAULT 0,
    authority_level INTEGER DEFAULT 2, -- 1=official primary, 2=professional media, 3=community lead
    topic_scope TEXT,
    last_run_at TEXT,
    last_success_at TEXT,
    last_status TEXT,
    last_error TEXT,
    last_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);

-- 文章表
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER REFERENCES sources(id),
    publisher TEXT,                   -- 平台 / 发布机构（证券时报、雪球、证监会…）
    author TEXT,                      -- 真实作者或机构
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    canonical_url TEXT,               -- 一手原始出处（默认等于 url）
    source_tier TEXT DEFAULT 'media', -- 'official' | 'media' | 'community'
    is_primary INTEGER DEFAULT 0,     -- 是否一手来源
    raw_text TEXT,
    raw_html TEXT,
    content_hash TEXT,
    published_at TEXT,                -- 原始发布时间
    fetched_at TEXT DEFAULT (datetime('now','localtime')),
    digest_date TEXT,                 -- 进入哪期日报
    source_type TEXT DEFAULT 'crawled'
);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_hash ON articles(content_hash);
CREATE INDEX IF NOT EXISTS idx_articles_digest ON articles(digest_date);

-- 暂存区
CREATE TABLE IF NOT EXISTS staged_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    source_note TEXT,
    raw_text TEXT,
    staged_at TEXT DEFAULT (datetime('now','localtime')),
    merged_at TEXT,
    status TEXT DEFAULT 'pending'
);

-- 单篇摘要
CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER UNIQUE REFERENCES articles(id),
    summary TEXT NOT NULL,
    tags TEXT,
    stance TEXT,
    confidence REAL,                  -- 模型解析置信度
    evidence_level TEXT DEFAULT 'unverified', -- 'official' | 'multi_source' | 'single_source' | 'unverified'
    generated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 每日分歧/共识
CREATE TABLE IF NOT EXISTS divergence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    digest_date TEXT NOT NULL,
    topic TEXT NOT NULL,
    bullish_authors TEXT,
    bearish_authors TEXT,
    summary_md TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 每日日报
CREATE TABLE IF NOT EXISTS digests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    title TEXT,
    one_liner TEXT,
    full_content_md TEXT,
    article_count INTEGER,
    article_ids TEXT,                 -- JSON 数组，冻结该期文章集合
    generated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 事件与可核验主张：阅读层只展示三件事，研究层可回溯到具体材料。
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    digest_date TEXT NOT NULL,
    event_key TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT,
    editorial_status TEXT DEFAULT 'staged',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(digest_date, event_key)
);
CREATE INDEX IF NOT EXISTS idx_events_digest ON events(digest_date);

CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    digest_date TEXT NOT NULL,
    claim_text TEXT NOT NULL,
    claim_type TEXT DEFAULT 'event',
    concise_conclusion TEXT,
    editorial_status TEXT DEFAULT 'staged',
    evidence_level TEXT DEFAULT 'unverified',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(event_id, claim_text)
);
CREATE INDEX IF NOT EXISTS idx_claims_digest ON claims(digest_date);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(editorial_status);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    article_id INTEGER NOT NULL REFERENCES articles(id),
    evidence_role TEXT NOT NULL DEFAULT 'context',
    quote_locator TEXT,
    source_direction TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(claim_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_article ON claim_evidence(article_id);

-- 首页三件事的冻结排序和编辑理由，避免渲染时临时重算。
CREATE TABLE IF NOT EXISTS digest_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    digest_date TEXT NOT NULL,
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    position INTEGER NOT NULL,
    selection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(digest_date, position),
    UNIQUE(digest_date, claim_id)
);
CREATE INDEX IF NOT EXISTS idx_digest_items_digest ON digest_items(digest_date);
-- 关键词趋势
CREATE TABLE IF NOT EXISTS keywords_trend (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    UNIQUE(keyword, date)
);

-- 流水线运行记录
CREATE TABLE IF NOT EXISTS job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    run_type TEXT DEFAULT 'daily',    -- 'daily' | 'backfill' | 'manual'
    status TEXT DEFAULT 'running',    -- 'running' | 'success' | 'failed' | 'partial'
    source_results TEXT,              -- JSON: 每个信源是否成功/篇数/失败原因
    stage_timings TEXT,               -- JSON: 各阶段耗时
    new_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    pending_verify_count INTEGER DEFAULT 0,
    model TEXT,
    prompt_version TEXT,
    dataset_version TEXT
);

CREATE TABLE IF NOT EXISTS model_usage (id INTEGER PRIMARY KEY, day TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, returned_model TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, estimated_cny REAL NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_model_usage_day ON model_usage(day);
CREATE TABLE IF NOT EXISTS article_judgments (article_id INTEGER PRIMARY KEY, content TEXT NOT NULL, generated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS summary_failures (article_id INTEGER PRIMARY KEY, status TEXT NOT NULL, retry_after TEXT NOT NULL);

-- Internal audit and generation history. Never selected into public exports.
CREATE TABLE IF NOT EXISTS generation_basis(article_id INTEGER PRIMARY KEY,source_fingerprint TEXT NOT NULL,model TEXT,prompt_version TEXT,generated_at TEXT,basis_kind TEXT DEFAULT 'generated');
CREATE TABLE IF NOT EXISTS generation_history(id INTEGER PRIMARY KEY,article_id INTEGER,source_fingerprint TEXT,summary TEXT,judgment TEXT,title_zh TEXT,reason TEXT,archived_at TEXT);
CREATE TABLE IF NOT EXISTS quality_review(article_id INTEGER PRIMARY KEY,status TEXT NOT NULL,reasons TEXT NOT NULL,source_fingerprint TEXT,checked_at TEXT NOT NULL,rule_version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_extractions(article_id INTEGER PRIMARY KEY,source_url TEXT,page_title TEXT,page_type TEXT,selector TEXT,body_chars INTEGER,paragraph_count INTEGER,link_density REAL,title_coverage REAL,extracted_at TEXT,rule_version TEXT);
CREATE TABLE IF NOT EXISTS public_event_links(article_id INTEGER PRIMARY KEY,event_id TEXT NOT NULL,association_status TEXT NOT NULL,basis TEXT NOT NULL,checked_at TEXT NOT NULL);
