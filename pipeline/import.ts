/**
 * 手动粘贴导入 + 暂存区合并
 *
 * CLI 用法：npx tsx pipeline/import.ts --url "https://..."
 * 调度：mergeStagedArticles() 在每日流水线中被调用
 */
import { fetchArticle } from '../lib/fetcher';
import { fetchWechatArticle } from '../crawlers/wechat';
import { readTable, writeTable } from '../lib/db';
import type { StagedArticleRow, ArticleRow } from '../lib/types';

/** CLI 入口：手动粘贴一条链接 */
async function main() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  if (urlIndex === -1 || !args[urlIndex + 1]) {
    console.error('用法: npx tsx pipeline/import.ts --url "https://..."');
    process.exit(1);
  }
  const url = args[urlIndex + 1];

  console.log(`[导入] 正在抓取: ${url}`);

  // 根据 URL 类型选择抓取器
  let title = '';
  let text = '';

  if (url.includes('mp.weixin.qq.com')) {
    // 微信文章用专用抓取器
    const result = await fetchWechatArticle(url);
    title = result.title;
    text = result.text;
    console.log(`[导入] 微信文章: ${title} (${text.length} 字)`);
  } else {
    // 通用抓取器
    const result = await fetchArticle(url);
    title = result.title;
    text = result.isSPA ? '' : result.text;
    if (result.isSPA) {
      console.log(`[导入] ⚠️ 该页面为动态加载，可能无法提取完整正文`);
    }
  }

  // 查重
  const staged = readTable('staged_articles') as StagedArticleRow[];
  if (staged.some((s) => s.url === url)) {
    console.log(`[导入] ⚠️ URL 已存在，跳过`);
    process.exit(0);
  }

  // 存入暂存区
  staged.push({
    id: staged.length + 1,
    url,
    title,
    source_note: '手动粘贴',
    raw_text: text,
    staged_at: new Date().toISOString(),
    merged_at: null,
    status: 'pending',
  });

  writeTable('staged_articles', staged);
  console.log(`[导入] ✅ 已存入暂存区: ${title}`);
  console.log(`[导入] 明天早上 cron 运行时会自动汇入日报`);
}

/** 暂存区合并：将 pending 文章转入 articles 表，标记为 merged */
export async function mergeStagedArticles(): Promise<number> {
  const staged = readTable('staged_articles') as StagedArticleRow[];
  const pending = staged.filter((s) => s.status === 'pending');

  if (pending.length === 0) {
    console.log('[暂存] 没有待合并的文章');
    return 0;
  }

  console.log(`[暂存] 合并 ${pending.length} 篇暂存文章`);

  const articles = readTable('articles') as ArticleRow[];
  const existingUrls = new Set(articles.map((a) => a.url));
  let merged = 0;

  for (const s of pending) {
    if (existingUrls.has(s.url)) {
      s.status = 'skipped';
      s.merged_at = new Date().toISOString();
      continue;
    }

    // 如果暂存时没有正文，再试一次（使用微信专用抓取器）
    let text = s.raw_text || '';
    if (!text || text.length < 50) {
      console.log(`[暂存]   补抓: ${s.url.slice(0, 60)}...`);
      try {
        if (s.url.includes('mp.weixin.qq.com')) {
          const result = await fetchWechatArticleRetry(s.url);
          text = result.text;
          s.title = result.title || s.title;
        } else {
          const result = await fetchArticle(s.url);
          if (!result.isSPA) text = result.text;
          s.title = result.title || s.title;
        }
        s.raw_text = text;
      } catch (e: any) {
        console.error(`[暂存]   补抓失败: ${e.message}`);
      }
    }

    if (text && text.length > 50) {
      articles.push({
        id: articles.length + 1,
        source_id: null,
        author: null,
        title: s.title || s.url,
        url: s.url,
        raw_text: text,
        raw_html: null,
        content_hash: null,
        published_at: new Date().toISOString().slice(0, 10),
        source_type: 'staged',
        fetched_at: new Date().toISOString(),
      });
      existingUrls.add(s.url);
      s.status = 'merged';
      merged++;
    } else {
      console.log(`[暂存]   ⚠️ 无法提取正文，跳过: ${s.title || s.url}`);
      s.status = 'skipped';
    }

    s.merged_at = new Date().toISOString();
  }

  // 重新索引
  for (let i = 0; i < articles.length; i++) articles[i].id = i + 1;
  writeTable('articles', articles);
  writeTable('staged_articles', staged);

  console.log(`[暂存] ✅ 合并完成: ${merged} 篇汇入, ${pending.length - merged} 篇跳过`);
  return merged;
}

/** 异步版本的微信文章重试 */
async function fetchWechatArticleRetry(url: string): Promise<{ title: string; text: string }> {
  try {
    return await fetchWechatArticle(url);
  } catch {
    return { title: '', text: '' };
  }
}

// 只有直接执行时才跑 CLI 入口
const isDirectRun = process.argv[1]?.includes('import.ts') || process.argv.includes('--url');
if (isDirectRun) {
  main().catch((e) => {
    console.error('[导入] 失败:', e.message);
    process.exit(1);
  });
}
