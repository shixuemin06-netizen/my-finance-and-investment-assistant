-- Additive migration. Legacy daily events, claims and notes remain untouched.
CREATE TABLE IF NOT EXISTS stories (
 id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,
 region TEXT NOT NULL,sector TEXT NOT NULL,theme TEXT NOT NULL,representative_article_id INTEGER NOT NULL,
 first_at TEXT NOT NULL,latest_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS story_articles (article_id INTEGER PRIMARY KEY,story_id TEXT NOT NULL,added_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_story_articles_story ON story_articles(story_id);
CREATE INDEX IF NOT EXISTS idx_stories_filter ON stories(sector,region,latest_at);
CREATE TABLE IF NOT EXISTS story_updates (
 id INTEGER PRIMARY KEY AUTOINCREMENT,story_id TEXT NOT NULL,article_id INTEGER NOT NULL,
 fingerprint TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(story_id,article_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_story_updates_story ON story_updates(story_id,id);
CREATE TABLE IF NOT EXISTS story_state (
 profile_id TEXT NOT NULL DEFAULT 'local',story_id TEXT NOT NULL,followed INTEGER NOT NULL DEFAULT 0,
 saved INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',last_read_update INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL,PRIMARY KEY(profile_id,story_id)
);
CREATE TABLE IF NOT EXISTS article_translations (article_id INTEGER PRIMARY KEY,title_zh TEXT NOT NULL,language TEXT NOT NULL,generated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scheduler_state (id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER,heartbeat_at TEXT,last_attempt_at TEXT,last_success_at TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS product_activity (id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,target_id TEXT,created_at TEXT NOT NULL);
