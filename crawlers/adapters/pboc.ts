/**
 * 人民银行政策公告适配器（官方源）。
 * 公告列表：http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html
 */
import type { NormalizedArticle } from '../../lib/types';
import type { Adapter } from './types';
import { fetchOfficialArticleDetail, fetchOfficialList } from './official-shared';

export const pbocAdapter: Adapter = {
  id: 'pboc',
  name: '人民银行政策公告',
  tier: 'official',
  isPrimary: true,
  async crawl(): Promise<NormalizedArticle[]> {
    const items = await fetchOfficialList({
      listUrl: 'http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html',
      hrefContains: '/125475/',
      requireDateInUrl: true,
      maxItems: 15,
    });

    const fetchedAt = new Date().toISOString();
    const articles: NormalizedArticle[] = [];

    for (const item of items) {
      const detail = await fetchOfficialArticleDetail(item.url);
      if (!detail.text || detail.text.length < 60) continue;
      articles.push({
        publisher: '中国人民银行',
        author: detail.author || '中国人民银行',
        title: detail.title || item.title,
        url: item.url,
        canonical_url: item.url,
        source_tier: 'official',
        is_primary: true,
        raw_text: detail.text,
        raw_html: null,
        published_at: detail.date || item.date,
        fetched_at: fetchedAt,
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    return articles;
  },
};
