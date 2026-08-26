/**
 * 微信公众号文章抓取器
 *
 * 策略：
 * 1. 直接抓 mp.weixin.qq.com 文章页（需要微信客户端 UA 拿到完整 HTML）
 * 2. 搜狗微信搜索 weixin.sogou.com → 获取公众号文章列表 → 逐篇抓正文
 *
 * 微信文章是服务端渲染的，只需要正确的 User-Agent（模拟微信内置浏览器）
 */

import * as cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs';
import { readTable, writeTable } from '../lib/db';
import type { ArticleRow } from '../lib/types';

/** 微信客户端 User-Agent —— 这是获取完整正文的关键 */
const WECHAT_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.40';

/** 抓取单篇微信公众号文章正文 */
export async function fetchWechatArticle(url: string): Promise<{
  title: string;
  author: string;
  text: string;
  publishDate: string;
}> {
  const { data: raw } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': WECHAT_UA,
      Accept: 'text/html,application/xhtml+xml',
    },
    responseType: 'arraybuffer',
  });

  const html = Buffer.from(raw).toString('utf-8');
  const $ = cheerio.load(html);

  // 标题
  const title =
    $('#activity-name').text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    '';

  // 作者
  const author =
    $('#js_name').text().trim() ||
    $('.rich_media_meta_text').first().text().trim() ||
    '';

  // 发布时间
  const publishDate =
    $('#publish_time').text().trim() ||
    $('.rich_media_meta_text').eq(1).text().trim() ||
    '';

  // 正文：微信文章正文在 #js_content 或 .rich_media_content 中
  const contentEl = $('#js_content, .rich_media_content');
  let text = '';
  if (contentEl.length > 0) {
    // 移除隐藏元素
    contentEl.find('[style*="display:none"], [style*="visibility:hidden"], .hide').remove();
    text = contentEl.text().trim();
  }

  // 兜底：聚合 p 标签
  if (!text || text.length < 100) {
    text = $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t: string) => t.length > 15)
      .join('\n\n');
  }

  // 清洗
  text = text.replace(/[\t ]{3,}/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();

  return { title, author, text, publishDate };
}

/**
 * 搜狗微信搜索：搜公众号名称 → 获取最新文章列表
 * 这是实验性功能，Phase 3 才启用
 */
export async function searchWechatBySogou(
  keyword: string
): Promise<Array<{ title: string; url: string; author: string; date: string }>> {
  const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}`;

  const { data: html } = await axios.get(searchUrl, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  const $ = cheerio.load(html);
  const results: Array<{ title: string; url: string; author: string; date: string }> = [];

  // 搜狗搜索结果解析
  $('.news-list li, .news-item').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3 a, .txt-box h3 a, .tit a').first().text().trim();
    const url = $el.find('h3 a, .txt-box h3 a, .tit a').first().attr('href') || '';
    const author = $el.find('.account, .s-p, .info').first().text().trim();
    const date = $el.find('.date, .s2, .time').first().text().trim();

    if (title && url) {
      results.push({ title, url, author, date });
    }
  });

  return results;
}

/**
 * 统一入口：抓取所有启用的微信公众号
 */
export async function crawlAllWechat(): Promise<number> {
  const sources = JSON.parse(
    fs.readFileSync('sources.json', 'utf-8')
  );
  const wxSources = sources.wechat?.filter((s: any) => s.enabled) || [];

  if (wxSources.length === 0) {
    console.log('[微信] 没有启用的微信公众号源（sources.json 中 enabled: false）');
    return 0;
  }

  let totalNew = 0;
  const articles = readTable('articles') as ArticleRow[];
  const existingUrls = new Set(articles.map((a) => a.url));

  for (const src of wxSources) {
    try {
      console.log(`[微信] 搜索: ${src.name} (${src.sogouKeyword})`);
      const items = await searchWechatBySogou(src.sogouKeyword);
      console.log(`[微信]   ${src.name} 搜到 ${items.length} 条`);

      // 只取今天的，去重
      const newItems = items
        .filter((i) => !existingUrls.has(i.url))
        .slice(0, 5); // 每个公众号每天最多 5 篇

      for (const item of newItems) {
        try {
          console.log(`[微信]   抓取: ${item.title.slice(0, 30)}...`);
          const detail = await fetchWechatArticle(item.url);

          if (detail.text && detail.text.length > 100) {
            articles.push({
              id: articles.length + 1,
              source_id: null,
              author: detail.author || src.name,
              title: detail.title || item.title,
              url: item.url,
              raw_text: detail.text,
              raw_html: null,
              content_hash: null,
              published_at: detail.publishDate || new Date().toISOString().slice(0, 10),
              source_type: 'crawled',
              fetched_at: new Date().toISOString(),
            });
            totalNew++;
            existingUrls.add(item.url);
          }

          // 搜狗请求频率控制：15 秒间隔（很重要，太快会弹验证码）
          await new Promise((r) => setTimeout(r, 15000));
        } catch (e: any) {
          console.error(`[微信]   抓取失败: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.error(`[微信] ${src.name} 搜索失败: ${e.message}`);
    }
  }

  if (totalNew > 0) {
    for (let i = 0; i < articles.length; i++) articles[i].id = i + 1;
    writeTable('articles', articles);
  }

  console.log(`[微信] ✅ 共新增 ${totalNew} 篇`);
  return totalNew;
}
