/**
 * RSS 适配器：抓取单个 RSS 源，输出规范化文章（不写库、不去重）。
 * 供 crawlers/adapters/registry.ts 调用。
 */
import { fetchRSS } from '../lib/fetcher';
import { normalizeDate } from '../lib/time';
import type { NormalizedArticle } from '../lib/types';
import type { RssSourceConfig } from './adapters/types';

export async function crawlRssSource(src: RssSourceConfig): Promise<NormalizedArticle[]> {
  const items = await fetchRSS(src.url);
  const tier = src.tier ?? 'community';
  const fetchedAt = new Date().toISOString();

  return items.map((item) => {
    const url = normalizeHttps(item.link);
    return {
      publisher: src.name,
      author: item.author || src.name,
      title: item.title,
      url,
      canonical_url: url,
      source_tier: tier,
      is_primary: src.isPrimary ?? false,
      raw_text: stripHtml(item.description) || item.title,
      raw_html: item.description || null,
      published_at: normalizeDate(item.pubDate),
      fetched_at: fetchedAt,
    } satisfies NormalizedArticle;
  });
}

/** 把明文 http:// 统一升级为 https://（雪球等站点强制 HTTPS，http 链接常被拦截） */
function normalizeHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, '')
    .trim();
}
