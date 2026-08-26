-- 信源表（注：实际信源配置以 sources.json 为准，本表预留结构化信源元数据）
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,           -- 'rss' | 'website' | 'wechat' | 'manual'
    config_json TEXT,
    priority INTEGER DEFAULT 2,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

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
