/**
 * Evidence grade is deliberately separate from model confidence:
 * - confidence answers whether the parser understood a text;
 * - evidence_level answers whether this claim has an official primary source or
 *   a known source; topic overlap never establishes independent corroboration.
 */
import db from './db';
import type { ArticleRow, EvidenceLevel, SummaryRow } from './types';

export function safeTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function sourceIdentity(article: ArticleRow): string | null {
  const value = article.publisher || article.author;
  return value ? value.trim().toLocaleLowerCase('zh-CN') : null;
}

function groupKey(tag: string, stance: SummaryRow['stance']): string {
  return `${tag.trim().toLocaleLowerCase('zh-CN')}::${stance || 'neutral'}`;
}

/** Pure function for tests and for materializing a frozen daily set. */
export function computeEvidenceLevels(articles: ArticleRow[], summaries: SummaryRow[]): void {
  const byId = new Map(articles.map(article => [article.id, article]));
  for (const summary of summaries) {
    const article = byId.get(summary.article_id);
    // Topic overlap does not establish corroboration of a concrete claim.
    summary.evidence_level = !article ? 'unverified'
      : article.source_tier === 'official' && article.is_primary === 1 ? 'official'
      : sourceIdentity(article) ? 'single_source' : 'unverified';
  }
}

/** Persist grades for a supplied frozen article set; returns the real pending count. */
export function persistEvidenceLevels(articleIds?: number[]): number {
  const where = articleIds?.length ? `WHERE s.article_id IN (${articleIds.map(() => '?').join(', ')})` : '';
  const rows = db.prepare(`
    SELECT a.*, s.id AS summary_id, s.article_id, s.summary, s.tags, s.stance,
           s.confidence, s.evidence_level, s.generated_at
    FROM summaries s JOIN articles a ON a.id = s.article_id
    ${where}
  `).all(...(articleIds || [])) as Array<ArticleRow & SummaryRow & { summary_id: number }>;

  const articles: ArticleRow[] = rows.map((row) => ({
    id: row.id,
    source_id: row.source_id,
    publisher: row.publisher,
    author: row.author,
    title: row.title,
    url: row.url,
    canonical_url: row.canonical_url,
    source_tier: row.source_tier,
    is_primary: row.is_primary,
    raw_text: row.raw_text,
    raw_html: row.raw_html,
    content_hash: row.content_hash,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    digest_date: row.digest_date,
    source_type: row.source_type,
  }));
  const summaries: SummaryRow[] = rows.map((row) => ({
    id: row.summary_id,
    article_id: row.article_id,
    summary: row.summary,
    tags: row.tags,
    stance: row.stance,
    confidence: row.confidence,
    evidence_level: row.evidence_level,
    generated_at: row.generated_at,
  }));

  computeEvidenceLevels(articles, summaries);
  db.transaction(() => {
    const update = db.prepare('UPDATE summaries SET evidence_level = ? WHERE id = ?');
    for (const summary of summaries) update.run(summary.evidence_level || 'unverified', summary.id);
  });
  return summaries.filter((summary) => summary.evidence_level === 'unverified').length;
}

export { evidenceLabel } from './evidence-labels';