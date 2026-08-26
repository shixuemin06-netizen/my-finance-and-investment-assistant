/**
 * 文章入库：把适配器输出的 NormalizedArticle 去重后写入 articles 表。
 * 去重依据：canonical_url + 正文哈希（md5 前 500 字）。
 */
import crypto from 'crypto';
import { readTable, writeTable } from '../lib/db';
import type { ArticleRow, NormalizedArticle } from '../lib/types';

export function ingestArticles(items: NormalizedArticle[]): number {
  if (items.length === 0) return 0;

  const articles = readTable('articles') as ArticleRow[];
  const seenUrl = new Set(articles.map((a) => a.url));
  const seenHash = new Set(
    articles.map((a) => a.content_hash).filter((h): h is string => Boolean(h))
  );

  let added = 0;
  for (const item of items) {
    const url = item.canonical_url || item.url;
    if (seenUrl.has(url)) continue;

    const contentHash = item.raw_text
      ? crypto.createHash('md5').update(item.raw_text.slice(0, 500)).digest('hex')
      : null;
    if (contentHash && seenHash.has(contentHash)) continue;

    const nextId = articles.length + 1;
    articles.push({
      id: nextId,
      source_id: null,
      publisher: item.publisher,
      author: item.author,
      title: item.title,
      url: item.url,
      canonical_url: item.canonical_url,
      source_tier: item.source_tier,
      is_primary: item.is_primary ? 1 : 0,
      raw_text: item.raw_text,
      raw_html: item.raw_html,
      content_hash: contentHash,
      published_at: item.published_at,
      fetched_at: item.fetched_at,
      digest_date: null,
      source_type: 'crawled',
    });

    seenUrl.add(url);
    if (contentHash) seenHash.add(contentHash);
    added++;
  }

  if (added > 0) {
    writeTable('articles', articles);
  }

  return added;
}
