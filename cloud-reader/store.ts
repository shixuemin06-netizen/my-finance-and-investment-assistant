import type { PublicArticle, PublicEdition, PublicEvent } from '../lib/public-edition';
import { beijingDay } from '../lib/overview-window';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface CloudDatabase { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export type StoredMaterial = { article: PublicArticle; event: PublicEvent };
export type SourceHealth = { id: string; name: string; url: string; status: string; accepted: number; error?: string };
export type RefreshReceipt = { checkedAt: string; added: number; revised: number; sources: SourceHealth[]; status: 'success' | 'partial' | 'failed' };

export async function state<T>(db: CloudDatabase, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM cloud_state WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? JSON.parse(row.value) as T : null;
}
export async function acquireLease(db: CloudDatabase, now: number, owner: string) {
  const result = await db.prepare("INSERT INTO cloud_state (key, value, updated_at) VALUES ('refresh-lock', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE cloud_state.updated_at < ?")
    .bind(owner, now + 90_000, now).run();
  return result.meta.changes === 1;
}
export async function releaseLease(db: CloudDatabase, owner: string) {
  await db.prepare("DELETE FROM cloud_state WHERE key = 'refresh-lock' AND value = ?").bind(owner).run();
}
export async function loadMaterials(db: CloudDatabase): Promise<StoredMaterial[]> {
  const rows = await db.prepare('SELECT payload FROM cloud_materials ORDER BY published_at DESC').all<{ payload: string }>();
  return rows.results.map(row => JSON.parse(row.payload) as StoredMaterial);
}

/** Pure public projection. Repeated polling cannot advance the content timestamp. */
export function mergeEdition(seed: PublicEdition, additions: StoredMaterial[], now = new Date().toISOString()): PublicEdition {
  const byUrl = new Map(seed.articles.map(article => [article.url, article]));
  const cloudEventByArticle = new Map<number, PublicEvent>();
  for (const item of additions) {
    const previous = byUrl.get(item.article.url);
    // Historical IDs and reviewed judgments remain stable when an unchanged URL is encountered.
    if (previous && previous.id !== item.article.id) continue;
    byUrl.set(item.article.url, item.article);
    cloudEventByArticle.set(item.article.id, item.event);
  }
  const articles = [...byUrl.values()].sort((a, b) => Date.parse(b.publishedAt || b.fetchedAt || '') - Date.parse(a.publishedAt || a.fetchedAt || '') || b.id - a.id);
  const articleIds = new Set(articles.map(a => a.id));
  const byEvent = new Map(seed.events.map(event => [event.id, event]));
  for (const event of cloudEventByArticle.values()) byEvent.set(event.id, event);
  const events = [...byEvent.values()].filter(event => event.articleIds.some(id => articleIds.has(id)))
    .sort((a, b) => Date.parse(b.latestAt || '') - Date.parse(a.latestAt || ''));
  const issues = new Map(seed.issues.map(issue => [issue.date, { ...issue, articleIds: [...issue.articleIds] }]));
  for (const { article } of additions) {
    if (!articleIds.has(article.id) || !cloudEventByArticle.has(article.id) || !article.publishedAt) continue;
    const date = beijingDay(article.publishedAt)!;
    const issue = issues.get(date) || { date, articleIds: [], generatedAt: article.fetchedAt };
    if (!issue.articleIds.includes(article.id)) issue.articleIds.push(article.id);
    issues.set(date, issue);
  }
  const contentUpdatedAt = articles.map(a => a.fetchedAt).filter((v): v is string => Boolean(v)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  // A read or unsuccessful source check does not constitute a new edition.
  const snapshotAt = contentUpdatedAt && Date.parse(contentUpdatedAt) > Date.parse(seed.snapshotAt) ? contentUpdatedAt : seed.snapshotAt;
  return { snapshotAt, contentUpdatedAt, articles, events, issues: [...issues.values()].sort((a, b) => b.date.localeCompare(a.date)) };
}

export function publicSearchData(edition: PublicEdition, receipt: RefreshReceipt | null) {
  return {
    snapshotAt: edition.snapshotAt, contentUpdatedAt: edition.contentUpdatedAt, update: receipt,
    articles: edition.articles.map(a => ({ id: a.id, title: a.title, originalTitle: a.originalTitle, topicLabel: a.topicLabel,
      summary: a.summary || a.factExcerpt, summaryKind: a.summary ? 'model' : 'source_excerpt', publisher: a.publisher,
      sourceTier: a.sourceTier, sourceRole: a.sourceRole, url: a.url, publishedAt: a.publishedAt, fetchedAt: a.fetchedAt,
      region: a.region, sector: a.sector, theme: a.theme, eventId: a.eventId })),
    events: edition.events, issues: edition.issues,
  };
}
