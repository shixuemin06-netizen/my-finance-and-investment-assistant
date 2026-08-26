/**
 * 证监会要闻适配器（官方源）。
 * 列表页是 JS 动态加载，真实接口为：
 *   https://www.csrc.gov.cn/searchList/{channelid}?_isJson=true&_pageSize=N&page=1
 * channelid 在列表页 HTML 的 <meta name="channelid"> 中。
 */
import axios from 'axios';
import type { NormalizedArticle } from '../../lib/types';
import type { Adapter } from './types';
import { fetchOfficialArticle } from './official-shared';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHANNEL_ID = 'a1a078ee0bc54721ab6b148884c784a8';
const MAX_ITEMS = 15;

interface CsrcApiItem {
  title: string;
  url: string;
  publishedTimeStr: string;
}

export const csrcAdapter: Adapter = {
  id: 'csrc',
  name: '证监会要闻',
  tier: 'official',
  isPrimary: true,
  async crawl(): Promise<NormalizedArticle[]> {
    const apiUrl = `https://www.csrc.gov.cn/searchList/${CHANNEL_ID}?_isAgg=true&_isJson=true&_pageSize=${MAX_ITEMS}&_template=index&_rangeTimeGte=&_channelName=&page=1`;
    const { data } = await axios.get(apiUrl, {
      timeout: 15000,
      headers: { 'User-Agent': UA },
    });

    const results: CsrcApiItem[] = data?.data?.results || [];
    const fetchedAt = new Date().toISOString();
    const articles: NormalizedArticle[] = [];

    for (const item of results) {
      const url = item.url.startsWith('//') ? `https:${item.url}` : item.url;
      const text = await fetchOfficialArticle(url);
      if (!text || text.length < 60) continue;
      articles.push({
        publisher: '证监会',
        author: '中国证监会',
        title: item.title,
        url,
        canonical_url: url,
        source_tier: 'official',
        is_primary: true,
        raw_text: text,
        raw_html: null,
        published_at: (item.publishedTimeStr || '').slice(0, 10) || null,
        fetched_at: fetchedAt,
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    return articles;
  },
};
