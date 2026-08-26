/**
 * 官方源适配器共享逻辑：抓列表页 → 解析（标题 / 链接 / 日期）→ 逐篇抓正文。
 * 政府网站多为服务端渲染静态页：直接遍历 <a>，用 hrefContains 过滤出文章链接，
 * 日期优先从 URL 里的 YYYYMMDD 提取，其次从相邻文本里的 YYYY-MM-DD 提取。
 */
import * as cheerio from 'cheerio';
import axios from 'axios';
import { fetchArticle } from '../../lib/fetcher';

export interface OfficialListConfig {
  listUrl: string;
  /** 限定链接 href 必须包含的子串（用于只取要闻/公告，不取导航） */
  hrefContains: string;
  /** 每轮最多抓取篇数 */
  maxItems?: number;
  /** 要求 URL 里含 8 位日期（排除「栏目标题 index.html」这类非文章链接） */
  requireDateInUrl?: boolean;
}

export interface OfficialListItem {
  title: string;
  url: string;
  date: string | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 抓列表页并解析出「标题 + 链接 + 日期」 */
export async function fetchOfficialList(config: OfficialListConfig): Promise<OfficialListItem[]> {
  const { data: html } = await axios.get(config.listUrl, {
    timeout: 15000,
    headers: { 'User-Agent': UA },
  });
  const $ = cheerio.load(html);

  const items: OfficialListItem[] = [];
  const seen = new Set<string>();

  $('a').each((_, el) => {
    const $a = $(el);
    const href = ($a.attr('href') || '').trim();
    const title = ($a.attr('title') || $a.text() || '').trim();

    if (!href || !title || title.length < 8) return;
    if (config.hrefContains && !href.includes(config.hrefContains)) return;

    const fullUrl = href.startsWith('http') ? href : new URL(href, config.listUrl).href;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    // 日期：优先 URL 里的 8 位 YYYYMMDD；其次父级 td/li 文本里的 YYYY-MM-DD
    let date: string | null = null;
    const urlDate = fullUrl.match(/(20\d{2})(\d{2})(\d{2})/);
    if (urlDate) {
      const y = urlDate[1];
      const m = urlDate[2];
      const d = urlDate[3];
      if (parseInt(m) >= 1 && parseInt(m) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
        date = `${y}-${m}-${d}`;
      }
    }
    if (config.requireDateInUrl && !date) return;
    if (!date) {
      const parentText = $a.parent().parent().text() || '';
      const m = parentText.match(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
      if (m) date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }

    items.push({ title, url: fullUrl, date });
  });

  return items.slice(0, config.maxItems ?? 15);
}

/** 抓单篇正文（复用通用抓取器，自带编码检测与多策略正文提取） */
export async function fetchOfficialArticle(url: string): Promise<string> {
  const result = await fetchArticle(url);
  if (result.isSPA) return '';
  return result.text;
}

export interface OfficialArticleDetail {
  title: string;
  author: string | null;
  date: string | null;
  text: string;
}

/** 抓单篇官方文章，返回结构化字段（标题/作者/日期/正文）。
 *  优先解析 meta（ArticleTitle/Author/PubDate）+ td.content；失败则回退通用抓取。 */
export async function fetchOfficialArticleDetail(url: string): Promise<OfficialArticleDetail> {
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': UA },
    responseType: 'arraybuffer',
  });
  const html = Buffer.from(data).toString('utf8');
  const $ = cheerio.load(html);

  const meta = (n: string) => ($('meta[name="' + n + '"]').attr('content') || '').trim();

  const title =
    meta('ArticleTitle') ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    '';
  const author = meta('Author') || meta('ContentSource') || null;
  const date = meta('PubDate').slice(0, 10) || null;

  // 正文：优先 td.content（PBOC），其次常见容器
  let text = $('td.content').first().text().trim();
  if (!text || text.length < 60) {
    text = (await fetchOfficialArticle(url)).trim();
  }
  text = text.replace(/[\t ]{3,}/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();

  return { title, author, date, text };
}
