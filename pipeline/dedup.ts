/**
 * 去重：按 url + content_hash 双重检查
 */
import crypto from 'crypto';
import { readTable, writeTable } from '../lib/db';
import type { ArticleRow } from '../lib/types';

export function dedupNewArticles(): number {
  const articles = readTable('articles') as ArticleRow[];

  if (articles.length <= 1) {
    console.log('[去重] 文章数 ≤1，跳过');
    return 0;
  }

  // 1. URL 去重 —— 保留 id 最小的
  const seenUrl = new Map<string, number>();
  const urlDupes = new Set<number>();
  for (const a of articles) {
    if (seenUrl.has(a.url)) {
      urlDupes.add(a.id);
    } else {
      seenUrl.set(a.url, a.id);
    }
  }

  // 2. 填充空的 content_hash
  for (const a of articles) {
    if (!a.content_hash && a.raw_text) {
      a.content_hash = crypto
        .createHash('md5')
        .update(a.raw_text.slice(0, 500))
        .digest('hex');
    }
  }

  // 3. 内容 hash 去重
  const seenHash = new Map<string, number>();
  const hashDupes = new Set<number>();
  for (const a of articles) {
    if (!a.content_hash) continue;
    if (seenHash.has(a.content_hash)) {
      hashDupes.add(a.id);
    } else {
      seenHash.set(a.content_hash, a.id);
    }
  }

  const allDupes = new Set([...urlDupes, ...hashDupes]);
  const filtered = articles.filter((a) => !allDupes.has(a.id));

  const removed = articles.length - filtered.length;
  if (removed > 0) {
    writeTable('articles', filtered);
  }

  console.log(`[去重] 移除 ${removed} 条重复文章，剩余 ${filtered.length}`);
  return removed;
}
