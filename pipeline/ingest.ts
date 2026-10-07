/** Incremental ingestion. Correct invalid extraction without retaining its generated claims. */
import crypto from 'crypto';
import db from '../lib/db';
import type { NormalizedArticle, ArticleRow } from '../lib/types';
import { assessContentQuality } from '../lib/content-quality';
import { archiveAndInvalidateGeneration, recordContentQuality } from '../lib/generation-provenance';

export function ingestArticles(items: NormalizedArticle[]): number {
  if (!items.length) return 0;
  const findUrl = db.prepare(`SELECT a.*,s.summary,s.tags,j.content judgment,b.source_fingerprint FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id LEFT JOIN generation_basis b ON b.article_id=a.id WHERE a.url = ? OR a.canonical_url = ? LIMIT 1`);
  const upgradeBody = db.prepare("UPDATE articles SET raw_text=?,raw_html=?,content_hash=? WHERE id=? AND COALESCE(raw_text,'')=?");
  const findHash = db.prepare('SELECT id FROM articles WHERE content_hash = ? LIMIT 1');
  const findSource = db.prepare('SELECT id FROM sources WHERE name = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO articles (
      source_id, publisher, author, title, url, canonical_url, source_tier, is_primary,
      raw_text, raw_html, content_hash, published_at, fetched_at, digest_date, source_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'crawled')
  `);
  let added = 0;
  db.transaction(() => {
    for (const item of items) {
      const canonical = item.canonical_url || item.url;
      const existing = findUrl.get(item.url, canonical) as ArticleRow | undefined;
      if (existing) {
        const body = item.raw_text?.trim() || '';
        const oldQuality = assessContentQuality(existing);
        // Assess against the stored title; a different article on a reused URL must not replace it silently.
        const newQuality = assessContentQuality({ ...existing, raw_text: body, raw_html: item.raw_html, summary: null, tags: null, judgment: null, source_fingerprint: null });
        if (!oldQuality.canGenerate && newQuality.canGenerate && body !== (existing.raw_text || '').trim()) {
          const hash = crypto.createHash('md5').update(existing.title + '\n' + body).digest('hex');
          const duplicate = findHash.get(hash);
          if (!duplicate || duplicate.id === existing.id) {
            archiveAndInvalidateGeneration(existing, 'extraction_corrected');
            upgradeBody.run(body, item.raw_html, hash, existing.id, existing.raw_text || '');
            recordContentQuality(existing.id, newQuality);
          }
        } else recordContentQuality(existing.id, oldQuality);
        continue;
      }
      const contentHash = item.raw_text ? crypto.createHash('md5').update(item.title + '\n' + item.raw_text).digest('hex') : null;
      if (contentHash && findHash.get(contentHash)) continue;
      const source = findSource.get(item.publisher);
      const result = insert.run(source?.id || null, item.publisher, item.author, item.title, item.url, canonical,
        item.source_tier, item.is_primary ? 1 : 0, item.raw_text, item.raw_html, contentHash, item.published_at, item.fetched_at);
      recordContentQuality(Number(result.lastInsertRowid), assessContentQuality({ ...item, is_primary: item.is_primary ? 1 : 0 }));
      added++;
    }
  });
  return added;
}
