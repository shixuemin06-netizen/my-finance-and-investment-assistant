/** Incremental, quality-gated generation. Rejected materials never consume model calls. */
import db from '../lib/db';
import { modelConfig, modelConfigured, realContentEnabled } from '../lib/model-config';
import { summarizeArticle } from '../lib/llm';
import { beijingDateSql } from '../lib/time';
import { assessContentQuality } from '../lib/content-quality';
import { contentFingerprint, recordContentQuality, saveGenerationBasis } from '../lib/generation-provenance';
import { validateJudgment } from '../lib/judgment';
import type { ArticleRow } from '../lib/types';

export async function summarizeAll(date?: string, bucketField: 'fetched_at' | 'published_at' = 'fetched_at', limit = 5, articleIds?: number[], summarize: typeof summarizeArticle = summarizeArticle): Promise<number> {
  if (!modelConfigured()) { console.log('[摘要] 未配置密钥，保留待处理材料。'); return 0; }
  if (!realContentEnabled()) { console.log('[摘要] 真实材料模型处理暂停，保留待处理材料。'); return 0; }
  if (articleIds && !articleIds.length) return 0;
  const args: (number | string)[] = [];
  let scope = '';
  if (articleIds) { scope = ' AND a.id IN (' + articleIds.map(() => '?').join(',') + ')'; args.push(...articleIds); }
  else if (date) { scope = ' AND ' + beijingDateSql('a.' + bucketField) + ' = ?'; args.push(date); }
  const batch = Math.min(5, Math.max(1, Math.floor(limit) || 5));
  // Inspect more than five candidates so an invalid newest item cannot block a valid one.
  const pending = db.prepare("SELECT a.* FROM articles a LEFT JOIN summaries s ON s.article_id=a.id WHERE (s.article_id IS NULL OR length(trim(s.summary))=0) AND NOT EXISTS(SELECT 1 FROM quality_review q WHERE q.article_id=a.id AND q.status='review') AND NOT EXISTS(SELECT 1 FROM summary_failures f WHERE f.article_id=a.id AND f.retry_after > datetime('now'))" + scope + ' ORDER BY a.id DESC LIMIT 40').all(...args) as ArticleRow[];
  const save = db.prepare("INSERT INTO summaries(article_id,summary,tags,stance,confidence,evidence_level,generated_at) VALUES(?,?,?,?,?,'unverified',?) ON CONFLICT(article_id) DO UPDATE SET summary=excluded.summary,tags=excluded.tags,stance=excluded.stance,confidence=excluded.confidence,generated_at=excluded.generated_at");
  let done = 0, calls = 0;
  for (const article of pending) {
    const basis = assessContentQuality(article);
    recordContentQuality(article.id, basis);
    if (!basis.canGenerate) continue;
    if (calls >= batch) break;
    try {
      calls++;
      const result = await summarize(article.title, article.author || article.publisher || '来源待补', article.published_at || '原文未标明日期，勿以收录日期代替', article.raw_text || '');
      if (!result.summary.trim()) throw new Error('Empty summary');
      const judgment = validateJudgment(result.judgment, (article.raw_text || '').slice(0, 6500));
      const checked = assessContentQuality({ ...article, summary: result.summary, tags: JSON.stringify(result.tags), judgment: judgment ? JSON.stringify(judgment) : null });
      // A model can return valid JSON with a semantically misplaced summary. Keep it for review, not publication.
      recordContentQuality(article.id, checked);
      if (checked.status !== 'accepted') {
        db.prepare("INSERT INTO summary_failures(article_id,status,retry_after) VALUES(?,'quality_review',datetime('now','+1 day')) ON CONFLICT(article_id) DO UPDATE SET status=excluded.status,retry_after=excluded.retry_after").run(article.id);
        continue;
      }
      const current = db.prepare('SELECT * FROM articles WHERE id=?').get(article.id) as ArticleRow | undefined;
      if (!current || contentFingerprint(current) !== basis.fingerprint) {
        if (current) recordContentQuality(article.id, { status: 'review', reasons: ['generation_source_changed'], fingerprint: contentFingerprint(current) });
        continue;
      }
      const generatedAt = new Date().toISOString();
      db.transaction(() => {
        save.run(article.id, result.summary, JSON.stringify(result.tags), result.stance, result.confidence, generatedAt);
        if (result.titleZh && !/[\u3400-\u9fff]/u.test(article.title) && /[\u3400-\u9fff]/u.test(result.titleZh)) db.prepare('INSERT INTO article_translations(article_id,title_zh,language,generated_at) VALUES(?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET title_zh=excluded.title_zh,generated_at=excluded.generated_at').run(article.id, result.titleZh, 'en', generatedAt);
        // Remove previous judgment when the current source cannot support one.
        if (judgment) db.prepare('INSERT INTO article_judgments(article_id,content,generated_at) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET content=excluded.content,generated_at=excluded.generated_at').run(article.id, JSON.stringify(judgment), generatedAt);
        else db.prepare('DELETE FROM article_judgments WHERE article_id=?').run(article.id);
        saveGenerationBasis(article.id, basis.fingerprint, modelConfig().model, generatedAt);
        db.prepare('DELETE FROM summary_failures WHERE article_id=?').run(article.id);
      });
      done++;
    } catch (error: any) {
      console.error('[摘要] articleId=' + article.id + ' 失败，status=' + (error?.status || 'unavailable'));
      db.prepare("INSERT INTO summary_failures(article_id,status,retry_after) VALUES(?,?,datetime('now','+10 minutes')) ON CONFLICT(article_id) DO UPDATE SET status=excluded.status,retry_after=excluded.retry_after").run(article.id, String(error?.status || 'invalid_output_or_network'));
      if ([401, 402, 403, 429].includes(error?.status)) break;
    }
  }
  console.log('[摘要] 完成 ' + done + '/' + calls + ' 次请求，检查 ' + pending.length + ' 篇候选。');
  return done;
}
