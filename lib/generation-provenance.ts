/** Local generation audit. Never export history or private research state. */
import db from './db';
import { QUALITY_RULE_VERSION } from './content-quality';

import { contentFingerprint, type GenerationSource } from './content-fingerprint';
export { contentFingerprint } from './content-fingerprint';

export function recordContentQuality(articleId: number, result: { status: string; reasons: string[]; fingerprint: string }, checkedAt = new Date().toISOString()): void {
  db.prepare(`INSERT INTO quality_review(article_id,status,reasons,source_fingerprint,checked_at,rule_version)
    VALUES(?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET
    status=excluded.status,reasons=excluded.reasons,source_fingerprint=excluded.source_fingerprint,
    checked_at=excluded.checked_at,rule_version=excluded.rule_version`)
    .run(articleId, result.status, JSON.stringify(result.reasons), result.fingerprint, checkedAt, QUALITY_RULE_VERSION);
}

/** Caller owns the surrounding transaction; preserves old outputs before invalidation. */
export function archiveAndInvalidateGeneration(source: GenerationSource & { id: number }, reason: string): boolean {
  const existing = db.prepare(`SELECT s.summary,j.content judgment,t.title_zh,b.source_fingerprint
    FROM articles a LEFT JOIN summaries s ON s.article_id=a.id
    LEFT JOIN article_judgments j ON j.article_id=a.id LEFT JOIN article_translations t ON t.article_id=a.id
    LEFT JOIN generation_basis b ON b.article_id=a.id WHERE a.id=?`).get(source.id);
  const hadOutput = Boolean(existing?.summary || existing?.judgment || existing?.title_zh);
  if (hadOutput) db.prepare(`INSERT INTO generation_history(article_id,source_fingerprint,summary,judgment,title_zh,reason,archived_at)
    VALUES(?,?,?,?,?,?,?)`).run(source.id, existing?.source_fingerprint || contentFingerprint(source), existing?.summary || null,
      existing?.judgment || null, existing?.title_zh || null, reason, new Date().toISOString());
  for (const table of ['summaries', 'article_judgments', 'article_translations', 'generation_basis', 'summary_failures']) {
    db.prepare('DELETE FROM ' + table + ' WHERE article_id=?').run(source.id);
  }
  return hadOutput;
}

export function saveGenerationBasis(articleId: number, fingerprint: string, model: string, generatedAt: string): void {
  db.prepare(`INSERT INTO generation_basis(article_id,source_fingerprint,model,prompt_version,generated_at,basis_kind)
    VALUES(?,?,?,'finance-summary-v2',?,'generated') ON CONFLICT(article_id) DO UPDATE SET
    source_fingerprint=excluded.source_fingerprint,model=excluded.model,prompt_version=excluded.prompt_version,
    generated_at=excluded.generated_at,basis_kind=excluded.basis_kind`).run(articleId, fingerprint, model, generatedAt);
}
