/**
 * 信源适配器统一接口。
 * 每个站点一个适配器：负责「抓取 → 输出规范化文章」，不写库、不去重。
 * 统一输出 NormalizedArticle（发布机构、真实作者、发布日期、抓取时间、原始链接、
 * 是否一手来源、来源等级、正文哈希由 pipeline 统一计算）。
 */
import type { NormalizedArticle, SourceTier } from '../../lib/types';

export interface Adapter {
  /** 适配器唯一 id（用于 job_runs 记录） */
  id: string;
  /** 展示名 */
  name: string;
  /** 来源等级 */
  tier: SourceTier;
  /** 是否一手来源 */
  isPrimary: boolean;
  /** 抓取并返回规范化文章（不写库、不去重） */
  crawl(): Promise<NormalizedArticle[]>;
}

/** sources.json 中 rss 源的静态配置 */
export interface RssSourceConfig {
  name: string;
  url: string;
  enabled: boolean;
  tier?: SourceTier;
  isPrimary?: boolean;
}

/** sources.json 中 website 源的静态配置 */
export interface WebsiteSourceConfig {
  name: string;
  listUrl: string;
  articleSelector: string;
  enabled: boolean;
  tier?: SourceTier;
  isPrimary?: boolean;
}

/** sources.json 中官方源的静态配置 */
export interface OfficialSourceConfig {
  id: string;
  name: string;
  enabled: boolean;
}
