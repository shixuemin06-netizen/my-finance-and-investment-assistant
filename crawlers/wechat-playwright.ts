/**
 * 微信公众号 Playwright 爬虫
 *
 * 搜狗搜索 → 搜狗链接自动跳转微信文章 → 提取正文
 * 关键：搜狗的 /link?url= 页面会用 JS 自动重定向到 mp.weixin.qq.com
 */

import { chromium, type Browser, type Page } from 'playwright';
import fs from 'fs';
import { readTable, writeTable } from '../lib/db';
import type { ArticleRow } from '../lib/types';

interface SogouResult {
  title: string;
  url: string;
  date: string;
}

/** 搜索一个公众号，返回文章列表 */
async function searchOneAccount(page: Page, keyword: string, maxResults: number = 5): Promise<SogouResult[]> {
  const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1500);

  // 检测验证码
  const captcha = await page.$('#seccodeImage, #seccodeInput');
  if (captcha) {
    console.warn(`[微信] ⚠️ 搜狗弹出验证码！请在浏览器窗口中手动完成验证`);
    // 在非 headless 模式下用户可手动操作
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(3000);
      if (!(await page.$('#seccodeImage, #seccodeInput'))) {
        console.log('[微信] 验证已通过');
        break;
      }
      if (i % 20 === 19) console.log('[微信]   仍在等待验证...');
    }
  }

  const results: SogouResult[] = await page.evaluate(() => {
    const items: SogouResult[] = [];
    const listItems = document.querySelectorAll('.news-list li, .news-list2 li, .wx-rb, [class*="news-item"]');
    listItems.forEach((el) => {
      const link = el.querySelector('h3 a, .txt-box h3 a, .tit a, a[href*="link"]') as HTMLAnchorElement | null;
      const title = link?.textContent?.trim() || '';
      const href = link?.getAttribute('href') || '';
      const dateEl = el.querySelector('.date, .s2, .time, [class*="time"]') as HTMLElement | null;
      const date = dateEl?.textContent?.trim() || '';
      if (title && href && href.includes('/link?')) {
        items.push({ title, url: href, date });
      }
    });
    return items;
  });

  return results.slice(0, maxResults);
}

/** 通过搜狗加密链接获取微信文章内容：搜狗页面 JS 自动重定向到微信 */
async function resolveAndExtract(
  page: Page,
  sogouLink: string
): Promise<{ wxUrl: string; title: string; author: string; text: string; date: string } | null> {
  const fullUrl = sogouLink.startsWith('http') ? sogouLink : `https://weixin.sogou.com${sogouLink}`;

  // 跳转到搜狗链接，搜狗会 JS 重定向到微信文章
  // 不设 waitUntil，因为重定向会自动触发
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // 等待重定向完成（搜狗 JS 重定向 + 微信页面加载）
  await page.waitForTimeout(3000);

  const currentUrl = page.url();

  // 如果被反爬拦截
  if (currentUrl.includes('antispider')) {
    return null;
  }

  // 如果不在微信文章页，再等一会（搜狗可能慢）
  if (!currentUrl.includes('mp.weixin.qq.com')) {
    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    if (!finalUrl.includes('mp.weixin.qq.com')) {
      return null;
    }
  }

  const wxUrl = page.url();

  // 提取微信文章正文
  const content = await page.evaluate(() => {
    const title =
      (document.querySelector('#activity-name') as HTMLElement)?.innerText?.trim() ||
      (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content?.trim() ||
      document.querySelector('h1')?.textContent?.trim() || '';

    const author =
      (document.querySelector('#js_name') as HTMLElement)?.innerText?.trim() || '';

    const date =
      (document.querySelector('#publish_time') as HTMLElement)?.innerText?.trim() || '';

    const contentEl = document.querySelector('#js_content, .rich_media_content');
    let text = '';
    if (contentEl) {
      contentEl.querySelectorAll('[style*="display:none"], [style*="visibility:hidden"]').forEach(e => (e as HTMLElement).remove());
      text = (contentEl as HTMLElement).innerText?.trim() || '';
    }

    return { title, author, text, date };
  });

  return { wxUrl, ...content };
}

/** 主入口：抓取所有启用的微信公众号 */
export async function crawlAllWechatPlaywright(): Promise<number> {
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf-8'));
  const wxSources = sources.wechat?.filter((s: any) => s.enabled) || [];

  if (wxSources.length === 0) {
    console.log('[微信] 没有启用的微信公众号源');
    return 0;
  }

  console.log(`[微信] 启动浏览器...`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // 先访问搜狗首页建立 Cookie
  const initPage = await context.newPage();
  try {
    await initPage.goto('https://weixin.sogou.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await initPage.waitForTimeout(1000);
  } catch { /* optional */ }
  await initPage.close();

  let totalNew = 0;
  const articles = readTable('articles') as ArticleRow[];
  const existingUrls = new Set(articles.map((a) => a.url));

  for (const src of wxSources) {
    try {
      console.log(`[微信] 搜索: ${src.name} (${src.sogouKeyword})`);
      const page = await context.newPage();

      const results = await searchOneAccount(page, src.sogouKeyword, 5);
      console.log(`[微信]   搜到 ${results.length} 条`);
      for (const r of results) {
        console.log(`[微信]     - ${r.title.slice(0, 40)} | ${r.date}`);
      }

      for (const item of results) {
        try {
          const result = await resolveAndExtract(page, item.url);

          if (!result) {
            console.log(`[微信]   ✗ 无法解析: ${item.title.slice(0, 30)}`);
            continue;
          }

          if (existingUrls.has(result.wxUrl)) {
            console.log(`[微信]   - 已存在: ${result.title.slice(0, 30)}`);
            continue;
          }

          if (result.text && result.text.length > 100) {
            articles.push({
              id: articles.length + 1,
              source_id: null,
              author: result.author || src.name,
              title: result.title || item.title,
              url: result.wxUrl,
              raw_text: result.text,
              raw_html: null,
              content_hash: null,
              published_at: result.date || new Date().toISOString().slice(0, 10),
              source_type: 'crawled',
              fetched_at: new Date().toISOString(),
            });
            totalNew++;
            existingUrls.add(result.wxUrl);
            console.log(`[微信]   ✅ ${result.title.slice(0, 30)} (${result.text.length}字)`);
          } else {
            console.log(`[微信]   ⚠️ 正文太短 (${result.text.length}字)`);
          }

          // 频率控制：8-12 秒随机间隔
          await page.waitForTimeout(8000 + Math.random() * 4000);
        } catch (e: any) {
          console.error(`[微信]   错误: ${e.message}`);
        }
      }

      await page.close();
      // 公众号之间间隔
      await new Promise((r) => setTimeout(r, 12000));
    } catch (e: any) {
      console.error(`[微信] ${src.name} 失败: ${e.message}`);
    }
  }

  await browser.close();

  if (totalNew > 0) {
    for (let i = 0; i < articles.length; i++) articles[i].id = i + 1;
    writeTable('articles', articles);
  }

  console.log(`[微信] ✅ 共新增 ${totalNew} 篇`);
  return totalNew;
}
