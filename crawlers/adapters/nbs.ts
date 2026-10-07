/** 国家统计局最新发布和解读（官方一手数据与说明）。 */
import type { NormalizedArticle } from '../../lib/types';
import type { Adapter } from './types';
import { normalizeDate } from '../../lib/time';
import { fetchOfficialArticleDetail, fetchOfficialList } from './official-shared';

export const nbsAdapter: Adapter = {
  id: 'nbs',
  name: '国家统计局数据发布',
  tier: 'official',
  isPrimary: true,
  async crawl(): Promise<NormalizedArticle[]> {
    const items = await fetchOfficialList({
      listUrl: 'https://www.stats.gov.cn/sj/zxfbhjd/',
      hrefContains: './',
      requireDateInUrl: true,
      maxItems: 15,
    });
    const fetchedAt = new Date().toISOString();
    const articles: NormalizedArticle[] = [];
    for (const item of items) {
      try {
        const detail = await fetchOfficialArticleDetail(item.url);
        if (detail.text.length < 80) continue;
        articles.push({
          publisher: '国家统计局',
          author: detail.author || '国家统计局',
          title: detail.title || item.title,
          url: item.url,
          canonical_url: item.url,
          source_tier: 'official',
          is_primary: true,
          raw_text: detail.text,
          raw_html: null,
          published_at: normalizeDate(detail.date || item.date),
          fetched_at: fetchedAt,
        });
      } catch {
        // A single official page failing must not make the whole source unhealthy.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return articles;
  },
};