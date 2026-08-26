/**
 * 网站列表页适配器：抓取单个网站源（列表页 → 逐篇正文），输出规范化文章。
 * 供 crawlers/adapters/registry.ts 调用。
 */
import * as cheerio from 'cheerio';
import axios from 'axios';
import iconv from 'iconv-lite';
import type { NormalizedArticle } from '../lib/types';
import type { WebsiteSourceConfig } from './adapters/types';

export async function crawlWebsiteSource(src: WebsiteSourceConfig): Promise<NormalizedArticle[]> {
  const { data: html } = await axios.get(src.listUrl, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const $ = cheerio.load(html);

  // 提取列表页链接
  const links: Array<{ title: string; url: string }> = [];
  $(src.articleSelector || 'a').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') || '').trim();
    const title = $el.text().trim();
    if (href && title && title.length > 5) {
      const fullUrl = href.startsWith('http')
        ? href
        : new URL(href, src.listUrl).href;
      links.push({ title, url: fullUrl });
    }
  });

  const tier = src.tier ?? 'media';
  const fetchedAt = new Date().toISOString();
  const articles: NormalizedArticle[] = [];

  for (const link of links.slice(0, 20)) {
    try {
      const text = await fetchArticleText(link.url);
      if (text && text.length > 100) {
        articles.push({
          publisher: src.name,
          author: null,
          title: link.title,
          url: link.url,
          canonical_url: link.url,
          source_tier: tier,
          is_primary: src.isPrimary ?? false,
          raw_text: text,
          raw_html: null,
          published_at: extractDateFromUrl(link.url) || null,
          fetched_at: fetchedAt,
        });
      }
      // 频率控制
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      // 单篇失败不影响整体
    }
  }

  return articles;
}

/** 从 URL 提取真实发布日期（如东方财富 /a/20260814xxx.html），无法识别则返回 null */
function extractDateFromUrl(url: string): string | null {
  const m = url.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 抓取单篇文章正文（通用静态页面） */
async function fetchArticleText(url: string): Promise<string> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      responseType: 'arraybuffer',
    });

    const raw = Buffer.from(html);
    let decoded: string;
    try {
      decoded = raw.toString('utf-8');
    } catch {
      decoded = iconv.decode(raw, 'gbk');
    }

    const $ = cheerio.load(decoded);
    $('script, style, nav, footer, header, aside, .sidebar, .comment, .ad, iframe, noscript').remove();

    // 多策略提取正文
    const selectors = [
      'article', '.article-content', '.article-body', '.post-content',
      '.content', '.rich_media_content', '#article-content', '.entry-content',
      '#js_content', '.detail-content', '.text', '.news-content',
    ];

    let text = '';
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        const t = el.text().trim();
        if (t.length > text.length) text = t;
      }
    }

    // 兜底：聚合 <p>
    if (!text || text.length < 100) {
      text = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t: string) => t.length > 15)
        .join('\n\n');
    }

    return text.replace(/\s{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}
