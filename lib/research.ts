/**
 * Read-model and materializer for the editorial research workflow.
 * A digest is a frozen article set; all homepage counts below stay inside it.
 */
import db from './db';
import { modelConfigured } from './model-config';
import { deliveryState } from './delivery';
import { beijingToday } from './time';
import { computeEvidenceLevels, safeTags } from './evidence';
import { latestJob, type SourceResult } from './jobs';
import { scoreInsights, selectionReasonFor } from './select';
import type {
  ArticleRow,
  BriefItem,
  DigestRow,
  EditorialStatus,
  EvidenceLevel,
  SourcePulse,
  SourceTier,
  SummaryRow,
} from './types';

export function parseArticleIds(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const ids = JSON.parse(value);
    return Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function placeholders(ids: number[]): string {
  return ids.map(() => '?').join(', ');
}

function sourceName(article: ArticleRow): string {
  return article.publisher || article.author || '未标注发布机构';
}

function eventKeyFor(summary: SummaryRow): string {
  // Shared topics are not shared events or claims.
  return 'article:' + summary.article_id;
}

function evidenceRank(level: EvidenceLevel | null | undefined): number {
  return { official: 4, multi_source: 3, single_source: 2, unverified: 1 }[level || 'unverified'];
}

function strongestEvidence(summaries: SummaryRow[]): EvidenceLevel {
  return summaries.reduce<EvidenceLevel>(
    (current, summary) => evidenceRank(summary.evidence_level) > evidenceRank(current)
      ? (summary.evidence_level || 'unverified')
      : current,
    'unverified',
  );
}

function statusFor(selected: boolean, level: EvidenceLevel): EditorialStatus {
  if (selected) return 'selected';
  if (level === 'official' || level === 'multi_source') return 'verifying';
  return 'staged';
}

function frozenRows(date: string): { digest?: DigestRow; articles: ArticleRow[]; summaries: SummaryRow[] } {
  const digest = db.prepare('SELECT * FROM digests WHERE date = ?').get(date) as DigestRow | undefined;
  const ids = parseArticleIds(digest?.article_ids);
  if (!digest || !ids.length) return { digest, articles: [], summaries: [] };

  const rows = db.prepare(`
    SELECT a.*, s.id AS summary_id, s.article_id, s.summary, s.tags, s.stance,
           s.confidence, s.evidence_level, s.generated_at
    FROM articles a JOIN summaries s ON s.article_id = a.id
    WHERE a.id IN (${placeholders(ids)})
  `).all(...ids) as Array<Record<string, any>>;

  return {
    digest,
    articles: rows.map((row) => ({
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
    })),
    summaries: rows.map((row) => ({
      id: row.summary_id,
      article_id: row.article_id,
      summary: row.summary,
      tags: row.tags,
      stance: row.stance,
      confidence: row.confidence,
      evidence_level: row.evidence_level,
      generated_at: row.generated_at,
    })),
  };
}

/**
 * Turn the frozen daily article set into events, inspectable claims/evidence,
 * and three persisted digest items. It is deterministic and safe to re-run.
 */
export function materializeDigestResearch(date: string): { claims: number; items: number; pending: number } {
  const { digest, articles, summaries } = frozenRows(date);
  if (!digest || !articles.length || !summaries.length) return { claims: 0, items: 0, pending: 0 };

  computeEvidenceLevels(articles, summaries);
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const summaryByArticle = new Map(summaries.map((summary) => [summary.article_id, summary]));
  const previous = db.prepare('SELECT article_ids FROM digests WHERE date < ? ORDER BY date DESC LIMIT 1').get(date) as { article_ids?: string | null } | undefined;
  const scored = scoreInsights(articles, summaries, parseArticleIds(previous?.article_ids));
  const scoreByArticle = new Map(scored.map((item) => [item.articleId, item]));

  const groups = new Map<string, Array<{ article: ArticleRow; summary: SummaryRow }>>();
  for (const summary of summaries) {
    const article = articleById.get(summary.article_id);
    if (!article) continue;
    const key = eventKeyFor(summary);
    const group = groups.get(key) || [];
    group.push({ article, summary });
    groups.set(key, group);
  }

  const chosenEventKeys: string[] = [];
  for (const candidate of scored) {
    const summary = summaryByArticle.get(candidate.articleId);
    if (!summary) continue;
    const key = eventKeyFor(summary);
    if (!chosenEventKeys.includes(key)) chosenEventKeys.push(key);
    if (chosenEventKeys.length === 3) break;
  }
  const chosen = new Set(chosenEventKeys);
  const claimForEvent = new Map<string, number>();
  let pending = 0;

  db.transaction(() => {
    const updateSummary = db.prepare('UPDATE summaries SET evidence_level = ? WHERE id = ?');
    const findEvent = db.prepare('SELECT id FROM events WHERE digest_date = ? AND event_key = ?');
    const findClaim = db.prepare('SELECT id FROM claims WHERE event_id = ? AND claim_text = ?');
    const clearEvidence = db.prepare('DELETE FROM claim_evidence WHERE claim_id = ?');
    const insertEvidence = db.prepare(`
      INSERT INTO claim_evidence (claim_id, article_id, evidence_role, quote_locator, source_direction)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(claim_id, article_id) DO UPDATE SET
        evidence_role=excluded.evidence_role, source_direction=excluded.source_direction
    `);

    for (const summary of summaries) updateSummary.run(summary.evidence_level || 'unverified', summary.id);

    for (const [eventKey, group] of groups) {
      const representative = [...group].sort((left, right) =>
        (scoreByArticle.get(right.article.id)?.score || 0) - (scoreByArticle.get(left.article.id)?.score || 0)
        || right.article.id - left.article.id,
      )[0];
      const evidence = strongestEvidence(group.map((item) => item.summary));
      const editorialStatus = statusFor(chosen.has(eventKey), evidence);
      const topic = safeTags(representative.summary.tags)[0] || null;
      const now = new Date().toISOString();

      db.upsert('events', {
        digest_date: date,
        event_key: eventKey,
        title: representative.article.title,
        topic,
        editorial_status: editorialStatus,
        updated_at: now,
      }, ['digest_date', 'event_key'], ['title', 'topic', 'editorial_status', 'updated_at']);
      const event = findEvent.get(date, eventKey);
      if (!event) continue;

      const claimText = representative.article.title;
      db.upsert('claims', {
        event_id: event.id,
        digest_date: date,
        claim_text: claimText,
        claim_type: 'event',
        concise_conclusion: representative.summary.summary,
        editorial_status: editorialStatus,
        evidence_level: evidence,
        updated_at: now,
      }, ['event_id', 'claim_text'], ['concise_conclusion', 'editorial_status', 'evidence_level', 'updated_at']);
      const claim = findClaim.get(event.id, claimText);
      if (!claim) continue;
      claimForEvent.set(eventKey, Number(claim.id));
      if (evidence === 'unverified') pending += 1;

      clearEvidence.run(claim.id);
      for (const item of group) {
        const role = item.article.source_tier === 'official' && item.article.is_primary === 1
          ? 'primary'
          : item.summary.stance && representative.summary.stance && item.summary.stance !== representative.summary.stance
            ? 'opposing'
            : item.article.id === representative.article.id
              ? 'context'
              : 'corroborating';
        insertEvidence.run(claim.id, item.article.id, role, item.summary.stance || 'neutral');
      }
    }

    // Scoped refresh only: one digest, never a destructive table rewrite.
    db.prepare('DELETE FROM digest_items WHERE digest_date = ?').run(date);
    const insertItem = db.prepare(`
      INSERT INTO digest_items (digest_date, claim_id, position, selection_reason)
      VALUES (?, ?, ?, ?)
    `);
    chosenEventKeys.forEach((eventKey, index) => {
      const claimId = claimForEvent.get(eventKey);
      const candidate = groups.get(eventKey)?.[0];
      if (!claimId || !candidate) return;
      insertItem.run(date, claimId, index + 1, selectionReasonFor(candidate.article.id, scored));
    });
  });

  return { claims: claimForEvent.size, items: chosenEventKeys.length, pending };
}

export function getBriefItems(date: string): BriefItem[] {
  const { articles, summaries } = frozenRows(date);
  computeEvidenceLevels(articles, summaries);
  const scores = scoreInsights(articles, summaries);
  const candidates = scores.filter(item => summaries.some(s => s.article_id === item.articleId && s.summary.trim()));
  const picked: typeof candidates = [];
  const topics = new Set<string>();
  const similar = (id: number) => {
    const article = articles.find(a => a.id === id)!;
    const title = article.title.replace(/[《》“”\\s]/g, '');
    return picked.some(p => {
      const previous = articles.find(a => a.id === p.articleId)!;
      const prior = previous.title.replace(/[《》“”\\s]/g, '');
      return article.url === previous.url || (sourceName(article) === sourceName(previous) && Math.min(title.length, prior.length) > 18 && (title.includes(prior) || prior.includes(title)));
    });
  };
  for (const candidate of candidates) {
    const topic = safeTags(summaries.find(s => s.article_id === candidate.articleId)?.tags || '')[0] || String(candidate.articleId);
    if (!topics.has(topic) && !similar(candidate.articleId)) { picked.push(candidate); topics.add(topic); }
    if (picked.length === 3) break;
  }
  for (const candidate of candidates) {
    if (picked.length === 3) break;
    if (!picked.some(p => p.articleId === candidate.articleId) && !similar(candidate.articleId)) picked.push(candidate);
  }
  return picked.map((item, index) => {
    const article = articles.find(a => a.id === item.articleId)!;
    const summary = summaries.find(s => s.article_id === item.articleId)!;
    return {
      position: index + 1, claimId: article.id, eventId: article.id, title: article.title,
      topic: safeTags(summary.tags)[0] || null, summary: summary.summary,
      selectionReason: item.reasons.slice(0, 2).join(' · '), evidenceLevel: summary.evidence_level || 'unverified',
      editorialStatus: 'selected' as const,
      supportSources: [{ name: sourceName(article), url: article.url, tier: article.source_tier || null, isPrimary: Boolean(article.is_primary) }],
      opposingSources: [], originalUrl: article.url,
    };
  });
}

export interface ReviewQueueItem {
  claimId: number;
  date: string;
  title: string;
  topic: string | null;
  status: EditorialStatus;
  evidence: EvidenceLevel;
  evidenceCount: number;
  reason: string;
}

export function getReviewQueue(date?: string): ReviewQueueItem[] {
  const target = date || (db.prepare('SELECT date FROM digests ORDER BY date DESC LIMIT 1').get() as { date?: string } | undefined)?.date;
  if (!target) return [];
  return db.prepare(`
    SELECT c.id AS claimId, c.digest_date AS date, e.title, e.topic,
           c.editorial_status AS status, c.evidence_level AS evidence,
           COUNT(ce.id) AS evidenceCount,
           CASE WHEN c.evidence_level = 'unverified' THEN '缺少可自动归并的主题或发布机构'
                WHEN c.evidence_level = 'single_source' THEN '仅有一间发布机构，建议补一手或独立佐证'
                WHEN c.editorial_status = 'selected' THEN '已入选简报，仍需编辑确认表述边界'
                ELSE '等待编辑复核' END AS reason
    FROM claims c
    JOIN events e ON e.id = c.event_id
    LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
    WHERE c.digest_date = ? AND c.editorial_status != 'published'
    GROUP BY c.id
    ORDER BY CASE c.evidence_level WHEN 'unverified' THEN 1 WHEN 'single_source' THEN 2 ELSE 3 END, c.id DESC
  `).all(target) as ReviewQueueItem[];
}

function parseSourceResults(value: string | null): SourceResult[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Complete API contract for the top bar and the detailed source drawer. */
export function getSourcePulse(date?: string): SourcePulse {
  const digest = date
    ? (db.prepare('SELECT * FROM digests WHERE date = ?').get(date) as DigestRow | undefined)
    : (db.prepare('SELECT * FROM digests ORDER BY date DESC LIMIT 1').get() as DigestRow | undefined);
  const ids = parseArticleIds(digest?.article_ids);
  const job = latestJob();
  const results = parseSourceResults(job?.source_results || null);
  const registered = db.prepare('SELECT source_key, name, enabled, last_status, last_run_at, last_count FROM sources').all() as Array<Record<string, any>>;
  const names = new Map(registered.map((source) => [source.source_key, source.name]));

  let officialCount = 0;
  let mediaCount = 0;
  let communityCount = 0;
  let pendingVerifyCount = 0;
  if (ids.length) {
    const counts = db.prepare(`
      SELECT a.source_tier AS tier, COUNT(*) AS count
      FROM articles a WHERE a.id IN (${placeholders(ids)}) GROUP BY a.source_tier
    `).all(...ids) as Array<{ tier: SourceTier | null; count: number }>;
    for (const row of counts) {
      if (row.tier === 'official') officialCount = Number(row.count);
      if (row.tier === 'media') mediaCount = Number(row.count);
      if (row.tier === 'community') communityCount = Number(row.count);
    }
    pendingVerifyCount = Number((db.prepare(`
      SELECT COUNT(*) AS count FROM articles a
      LEFT JOIN summaries s ON s.article_id = a.id
      WHERE a.id IN (${placeholders(ids)})
        AND (s.article_id IS NULL OR s.evidence_level IS NULL OR s.evidence_level = 'unverified')
    `).get(...ids) as { count: number }).count || 0);
  }

  const failedSources = results.filter((result) => !result.ok).map((result) => ({
    name: names.get(result.id) || result.id,
    reason: result.error || null,
  }));
  const enabledSourceCount = registered.filter((source) => source.enabled).length;
  const totalSources = Math.max(results.length, enabledSourceCount);
  const normalSources = registered.filter(source => source.enabled && source.last_status === 'success' && source.last_count > 0).length;
  const sourceCheckedAt = registered.map(s => s.last_run_at as string).filter(Boolean).sort().at(-1) || null;
  const baseStatus = job?.status === 'success' || job?.status === 'partial' || job?.status === 'failed' || job?.status === 'running'
    ? job.status
    : 'idle';
  // A configured source that was added after the last run is neither healthy nor failed yet.
  const runStatus = baseStatus === 'success' && normalSources < totalSources ? 'partial' : baseStatus;

  const summaryCount = ids.length ? Number(db.prepare("SELECT COUNT(*) n FROM summaries WHERE length(trim(summary)) > 0 AND article_id IN (" + placeholders(ids) + ")").get(...ids)?.n || 0) : 0;
  const articleCount = ids.length ? Number(db.prepare("SELECT COUNT(*) n FROM articles WHERE id IN (" + placeholders(ids) + ")").get(...ids)?.n || 0) : 0;
  const latestReadable = db.prepare("SELECT d.date FROM digests d WHERE EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(d.article_ids) THEN d.article_ids ELSE '[]' END) j JOIN summaries s ON s.article_id=j.value WHERE length(trim(s.summary)) > 0) ORDER BY d.date DESC LIMIT 1").get();
  return {
    digestDate: digest?.date || null, articleCount, summaryCount,
    ...deliveryState(digest?.date || null, articleCount, summaryCount, summaryCount, beijingToday()),
    latestReadableDate: latestReadable?.date || null, modelConfigured: modelConfigured(), sourceCheckedAt,
    updatedAt: job?.finished_at || digest?.generated_at || null,
    normalSources,
    totalSources,
    officialCount,
    mediaCount,
    communityCount,
    failedSources,
    pendingVerifyCount,
    runStatus,
  };
}