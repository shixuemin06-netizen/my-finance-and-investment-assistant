// ===== 数据库行类型 =====

export type SourceTier = 'official' | 'media' | 'community';
export type EvidenceLevel = 'official' | 'multi_source' | 'single_source' | 'unverified';
export type EditorialStatus = 'staged' | 'verifying' | 'verified' | 'selected' | 'published' | 'rejected';
export type EvidenceRole = 'primary' | 'corroborating' | 'opposing' | 'context';

export interface SourceRow {
  id: number;
  source_key?: string | null;
  name: string;
  platform: 'rss' | 'website' | 'wechat' | 'manual';
  config_json: string | null;
  priority: number;
  enabled: number;
  source_tier?: SourceTier | null;
  is_primary?: number | null;
  authority_level?: number | null;
  topic_scope?: string | null;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_status?: 'success' | 'partial' | 'failed' | 'running' | null;
  last_error?: string | null;
  last_count?: number | null;
  created_at: string;
}

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

export interface SummaryRow {
  id: number;
  article_id: number;
  summary: string;
  tags: string | null;
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
  article_ids: string | null;
  generated_at: string;
}

export interface KeywordTrendRow {
  id: number;
  keyword: string;
  date: string;
  count: number;
}

// ===== 研究/编辑数据模型 =====

export interface EventRow {
  id: number;
  digest_date: string;
  event_key: string;
  title: string;
  topic: string | null;
  editorial_status: EditorialStatus;
  created_at: string;
  updated_at: string;
}

export interface ClaimRow {
  id: number;
  event_id: number;
  digest_date: string;
  claim_text: string;
  claim_type: string;
  concise_conclusion: string | null;
  editorial_status: EditorialStatus;
  evidence_level: EvidenceLevel;
  created_at: string;
  updated_at: string;
}

export interface ClaimEvidenceRow {
  id: number;
  claim_id: number;
  article_id: number;
  evidence_role: EvidenceRole;
  quote_locator: string | null;
  source_direction: 'bullish' | 'bearish' | 'neutral' | null;
  created_at: string;
}

export interface DigestItemRow {
  id: number;
  digest_date: string;
  claim_id: number;
  position: number;
  selection_reason: string | null;
  created_at: string;
}

export interface SourcePulse {
  digestDate: string | null;
  articleCount: number;
  summaryCount: number;
  pendingSummaryCount: number;
  contentState: 'empty' | 'pending' | 'partial' | 'ready';
  stale: boolean;
  latestReadableDate: string | null;
  modelConfigured: boolean;
  sourceCheckedAt: string | null;
  updatedAt: string | null;
  normalSources: number;
  totalSources: number;
  officialCount: number;
  mediaCount: number;
  communityCount: number;
  failedSources: Array<{ name: string; reason: string | null }>;
  pendingVerifyCount: number;
  runStatus: 'success' | 'partial' | 'failed' | 'idle' | 'running';
}

export interface BriefItem {
  position: number;
  claimId: number;
  eventId: number;
  title: string;
  topic: string | null;
  summary: string;
  selectionReason: string | null;
  evidenceLevel: EvidenceLevel;
  editorialStatus: EditorialStatus;
  supportSources: Array<{ name: string; url: string; tier: SourceTier | null; isPrimary: boolean }>;
  opposingSources: Array<{ name: string; url: string; tier: SourceTier | null; isPrimary: boolean }>;
  originalUrl: string | null;
}

// ===== 流水线运行记录 =====

export interface JobRunRow {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  run_type: 'daily' | 'backfill' | 'manual';
  status: 'running' | 'success' | 'failed' | 'partial';
  source_results: string | null;
  stage_timings: string | null;
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
  judgment?: import('./judgment').Judgment;
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