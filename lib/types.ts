// ===== 数据库行类型 =====

export interface SourceRow {
  id: number;
  name: string;
  platform: 'rss' | 'website' | 'wechat' | 'manual';
  config_json: string | null;
  priority: number;
  enabled: number;
  created_at: string;
}

export type SourceTier = 'official' | 'media' | 'community';

export interface ArticleRow {
  id: number;
  source_id: number | null;
  publisher?: string | null;
  author: string | null;
  title: string;
  url: string;
  canonical_url?: string | null;
  source_tier?: SourceTier | null;
  is_primary?: number | null;
  raw_text: string | null;
  raw_html: string | null;
  content_hash: string | null;
  published_at: string | null;
  fetched_at: string;
  digest_date?: string | null;
  source_type: 'crawled' | 'staged';
}

export interface StagedArticleRow {
  id: number;
  url: string;
  title: string | null;
  source_note: string | null;
  raw_text: string | null;
  staged_at: string;
  merged_at: string | null;
  status: 'pending' | 'merged' | 'skipped';
}

export type EvidenceLevel = 'official' | 'multi_source' | 'single_source' | 'unverified';

export interface SummaryRow {
  id: number;
  article_id: number;
  summary: string;
  tags: string | null;      // JSON array
  stance: 'bullish' | 'bearish' | 'neutral' | null;
  confidence: number | null;
  evidence_level: EvidenceLevel | null;
  generated_at: string;
}

export interface DivergenceRow {
  id: number;
  digest_date: string;
  topic: string;
  bullish_authors: string | null;
  bearish_authors: string | null;
  summary_md: string | null;
  created_at: string;
}

export interface DigestRow {
  id: number;
  date: string;
  title: string | null;
  one_liner: string | null;
  full_content_md: string | null;
  article_count: number | null;
  article_ids: string | null; // JSON array
  generated_at: string;
}

export interface KeywordTrendRow {
  id: number;
  keyword: string;
  date: string;
  count: number;
}

// ===== 流水线运行记录 =====

export interface JobRunRow {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  run_type: 'daily' | 'backfill' | 'manual';
  status: 'running' | 'success' | 'failed' | 'partial';
  source_results: string | null; // JSON
  stage_timings: string | null;  // JSON
  new_count: number | null;
  skipped_count: number | null;
  failed_count: number | null;
  pending_verify_count: number | null;
  model: string | null;
  prompt_version: string | null;
  dataset_version: string | null;
}

// ===== 信源适配器统一输出 =====

export interface NormalizedArticle {
  publisher: string;
  author: string | null;
  title: string;
  url: string;
  canonical_url: string;
  source_tier: SourceTier;
  is_primary: boolean;
  raw_text: string | null;
  raw_html: string | null;
  published_at: string | null;
  fetched_at: string;
}

// ===== AI 返回类型 =====

export interface ArticleSummary {
  summary: string;
  tags: string[];
  stance: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

// ===== 信源配置类型 =====

export interface RssSource {
  name: string;
  url: string;
  enabled: boolean;
}

export interface WebsiteSource {
  name: string;
  listUrl: string;
  articleSelector: string;
  enabled: boolean;
}

export interface WechatSource {
  name: string;
  sogouKeyword: string;
  priority: number;
  enabled: boolean;
}

export interface SourcesConfig {
  rss: RssSource[];
  websites: WebsiteSource[];
  wechat: WechatSource[];
  x_accounts: string[];
}
