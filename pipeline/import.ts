/** Manual inbox import and incremental staged-article merge. */
import { fetchArticle } from '../lib/fetcher';
import { fetchWechatArticle } from '../crawlers/wechat';
import db from '../lib/db';
import { beijingToday } from '../lib/time';
import type { StagedArticleRow } from '../lib/types';

async function main() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  const url = urlIndex >= 0 ? args[urlIndex + 1] : null;
  if (!url) {
    console.error('用法: npx tsx pipeline/import.ts --url "https://..."');
    process.exit(1);
  }
  if (db.prepare('SELECT id FROM staged_articles WHERE url = ?').get(url)) {
    console.log('[导入] URL 已存在，跳过');
    return;
  }

  let title = '';
  let text = '';
  if (url.includes('mp.weixin.qq.com')) {
    const result = await fetchWechatArticle(url);
    title = result.title;
    text = result.text;
  } else {
    const result = await fetchArticle(url);
    title = result.title;
    text = result.isSPA ? '' : result.text;
    if (result.isSPA) console.log('[导入] 该页面为动态加载，正文可能需要人工补充');
  }
  db.prepare(`
    INSERT INTO staged_articles (url, title, source_note, raw_text, staged_at, merged_at, status)
    VALUES (?, ?, '手动粘贴', ?, ?, NULL, 'pending')
  `).run(url, title, text, new Date().toISOString());
  console.log(`[导入] 已存入收件箱：${title || url}`);
}

export async function mergeStagedArticles(stagedId?:number): Promise<number> {
  const pending = db.prepare("SELECT * FROM staged_articles WHERE status = 'pending'"+(stagedId?' AND id=?':'')+" ORDER BY id ASC").all(...(stagedId?[stagedId]:[])) as StagedArticleRow[];
  if (!pending.length) {
    console.log('[暂存] 没有待合并的文章');
    return 0;
  }

  const exists = db.prepare('SELECT id FROM articles WHERE url = ? OR canonical_url = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO articles (
      source_id, publisher, author, title, url, canonical_url, source_tier, is_primary,
      raw_text, raw_html, content_hash, published_at, fetched_at, digest_date, source_type
    ) VALUES (NULL, NULL, NULL, ?, ?, ?, 'community', 0, ?, NULL, NULL, ?, ?, NULL, 'staged')
  `);
  const updateStage = db.prepare(`
    UPDATE staged_articles SET title = ?, raw_text = ?, merged_at = ?, status = ? WHERE id = ?
  `);
  let merged = 0;

  for (const staged of pending) {
    const now = new Date().toISOString();
    if (exists.get(staged.url, staged.url)) {
      updateStage.run(staged.title, staged.raw_text, now, 'skipped', staged.id);
      continue;
    }
    let title = staged.title || staged.url;
    let text = staged.raw_text || '';
    if (text.length < 50) {
      try {
        if (staged.url.includes('mp.weixin.qq.com')) {
          const result = await fetchWechatArticle(staged.url);
          title = result.title || title;
          text = result.text;
        } else {
          const result = await fetchArticle(staged.url);
          title = result.title || title;
          if (!result.isSPA) text = result.text;
        }
      } catch (error: any) {
        console.error(`[暂存] 补抓失败：${error.message}`);
      }
    }
    if (text.length < 50) {
      updateStage.run(title, text, now, 'skipped', staged.id);
      continue;
    }
    insert.run(title, staged.url, staged.url, text, null, now);
    updateStage.run(title, text, now, 'merged', staged.id);
    merged += 1;
  }
  console.log(`[暂存] 合并完成：${merged}/${pending.length}`);
  return merged;
}

const isDirectRun = process.argv[1]?.includes('import.ts') || process.argv.includes('--url');
if (isDirectRun) {
  main().catch((error) => {
    console.error('[导入] 失败:', error.message);
    process.exit(1);
  });
}