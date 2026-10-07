import { buildPublicEdition, type PublicEdition } from '../lib/public-edition';
import { createPublicReader } from '../lib/public-reader-ui';
import { fetchCloudSources } from './feeds';
import { emailBusinessDate, renderDigestEmail } from '../lib/digest-email';
import { acquireLease, loadMaterials, mergeEdition, publicSearchData, releaseLease, state,
  type CloudDatabase, type RefreshReceipt, type StoredMaterial } from './store';

type Assets = { fetch(request: Request): Promise<Response> };
export type Environment = { DB: CloudDatabase; ASSETS: Assets };
const LOGO = '<img src="/reader/cutout-4-faa830732ac5.webp" alt="" width="32" height="34">';
const SITE_ORIGIN = 'https://finance-research-shi.shixuemin06.chatgpt.site';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };

async function seedEdition(env: Environment, request: Request): Promise<PublicEdition> {
  const response = await env.ASSETS.fetch(new Request(new URL('/assets/edition-seed.json', request.url)));
  if (!response.ok) throw new Error('Published baseline unavailable');
  return response.json();
}

async function publishedReceipt(env: Environment, request: Request): Promise<RefreshReceipt | null> {
  const response = await env.ASSETS.fetch(new Request(new URL('/assets/source-check.json', request.url)));
  if (!response.ok) return null;
  try {
    const value = await response.json() as RefreshReceipt;
    return value.checkedAt && Number.isFinite(Date.parse(value.checkedAt)) && Array.isArray(value.sources) ? value : null;
  } catch { return null; }
}

/** Fixed-source read-through cache; no caller-supplied URLs, articles, credentials or write methods. */
export async function refreshIfDue(env: Environment, seed: PublicEdition, now = Date.now(), fetchSources = fetchCloudSources) {
  const previous = await state<RefreshReceipt>(env.DB, 'last-refresh');
  if (previous && now - Date.parse(previous.checkedAt) < 3_600_000) return previous;
  const owner = crypto.randomUUID();
  if (!await acquireLease(env.DB, now, owner)) return previous;
  try {
    const secondCheck = await state<RefreshReceipt>(env.DB, 'last-refresh');
    if (secondCheck && now - Date.parse(secondCheck.checkedAt) < 3_600_000) return secondCheck;
    const result = await fetchSources(now);
    const accepted = buildPublicEdition(result.rows, [], new Date(now).toISOString());
    const existing = await loadMaterials(env.DB);
    const seededUrls = new Set(seed.articles.map(a => a.url));
    const existingByUrl = new Map(existing.map(v => [v.article.url, v]));
    const statements = [];
    let added = 0, revised = 0;
    for (const candidate of accepted.articles) {
      let article = candidate;
      if (seededUrls.has(article.url)) continue;
      const old = existingByUrl.get(article.url);
      const sameSource = old?.article.basisFingerprint === article.basisFingerprint;
      if (old && sameSource && old.article.factExcerpt === article.factExcerpt) continue;
      // A corrected source must not invalidate already shared material or event URLs.
      article = { ...article, id: old?.article.id || article.id, eventId: old?.event.id || 'cloud-' + article.id.toString(36),
        ...(old && sameSource ? { fetchedAt: old.article.fetchedAt } : {}) };
      // Cloud ingestion keeps each publication separate until a cross-source relationship is reviewed.
      const event = { id: article.eventId, title: article.title, articleIds: [article.id], representativeArticleId: article.id,
        region: article.region, sector: article.sector, theme: article.theme, firstAt: article.publishedAt,
        latestAt: article.publishedAt, sourceFamilyCount: 1, independence: 'unverified' as const };
      // Store only the allowlisted public projection, never a complete source body.
      const value: StoredMaterial = { article, event };
      statements.push(env.DB.prepare('INSERT INTO cloud_materials (url, article_id, published_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET published_at = excluded.published_at, payload = excluded.payload')
        .bind(article.url, article.id, article.publishedAt, JSON.stringify(value)));
      if (old) revised++; else added++;
    }
    const successful = result.sources.filter(s => s.status !== 'failed').length;
    const receipt: RefreshReceipt = { checkedAt: new Date(now).toISOString(), added, revised, sources: result.sources,
      status: !successful ? 'failed' : result.sources.every(s => s.status === 'ok') ? 'success' : 'partial' };
    statements.push(env.DB.prepare('INSERT INTO cloud_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .bind('last-refresh', JSON.stringify(receipt), now));
    await env.DB.batch(statements);
    return receipt;
  } finally { await releaseLease(env.DB, owner); }
}

export async function handleRequest(request: Request, env: Environment): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url), pathname = url.pathname.replace(/\/+$/, '') || '/';
  // Baseline is internal to the asset binding. Readers obtain the current public projection instead.
  if (pathname === '/assets/edition-seed.json') return new Response('Not found', { status: 404 });
  if ((pathname.startsWith('/reader/') || pathname.startsWith('/assets/')) && pathname !== '/assets/public-data.json') return env.ASSETS.fetch(request);
  try {
    const seed = await seedEdition(env, request);
    const cachedReceipt = pathname === '/api/edition' ? await refreshIfDue(env, seed) : await state<RefreshReceipt>(env.DB, 'last-refresh');
    const savedReceipt = await publishedReceipt(env, request);
    const receipt = savedReceipt && (!cachedReceipt || Date.parse(savedReceipt.checkedAt) > Date.parse(cachedReceipt.checkedAt)) ? savedReceipt : cachedReceipt;
    const edition = mergeEdition(seed, await loadMaterials(env.DB));
    if (pathname === '/api/edition' || pathname === '/assets/public-data.json') return Response.json(publicSearchData(edition, receipt), { headers });
    if (pathname === '/api/status') return Response.json({ contentUpdatedAt: edition.contentUpdatedAt, update: receipt }, { headers });
    if (pathname === '/api/email-digest') return Response.json(renderDigestEmail(edition, { businessDate: emailBusinessDate(), siteUrl: SITE_ORIGIN }), { headers });
    const ui = createPublicReader(edition, LOGO, SITE_ORIGIN, { mode: 'cloud', checkedAt: receipt?.checkedAt || null, updateStatus: receipt?.status || null });
    let body: string | null = null;
    if (pathname === '/') body = ui.home();
    else if (['/macro', '/industry', '/search'].includes(pathname)) body = ui.filterPage(pathname.slice(1) as 'macro' | 'industry' | 'search');
    else if (pathname === '/about') body = ui.shell('阅读与更新说明', 'about', ui.about(), '', '/about/');
    else if (pathname === '/settings') body = ui.shell('阅读设置', 'about', ui.settings(), '', '/settings/');
    else if (pathname === '/daily') body = ui.shell('财经日报', 'daily', edition.issues.length ? ui.issueBody(edition.issues[0]) : ui.empty('暂无已发布材料。'), '', '/daily/');
    else {
      const articleMatch = pathname.match(/^\/articles\/(\d+)$/), eventMatch = pathname.match(/^\/events\/([^/]+)$/), issueMatch = pathname.match(/^\/(?:daily|digest|share)\/(\d{4}-\d{2}-\d{2})$/);
      const article = articleMatch && edition.articles.find(a => a.id === Number(articleMatch[1]));
      const event = eventMatch && edition.events.find(e => e.id === eventMatch[1]);
      const issue = issueMatch && edition.issues.find(i => i.date === issueMatch[1]);
      if (article) body = ui.shell(article.title, article.sector === 'macro' ? 'macro' : 'industry', ui.articleBody(article), '', pathname + '/');
      if (event) body = ui.shell(event.title, event.sector === 'macro' ? 'macro' : 'industry', ui.eventBody(event), '', pathname + '/');
      if (issue) body = ui.shell(issue.date + ' 财经日报', 'daily', ui.issueBody(issue), '', pathname + '/');
    }
    // Keep existing quarantine and merged-event URLs usable after the runtime upgrade.
    if (body === null) return env.ASSETS.fetch(request);
    return new Response(request.method === 'HEAD' ? null : body, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('reader_request_failed', error instanceof Error ? error.message : 'unknown');
    if (pathname.startsWith('/api/')) return Response.json({ error: '资料更新暂时不可用，请稍后重试。' }, { status: 503, headers });
    // Storage outage preserves the previously reviewed published pages.
    return env.ASSETS.fetch(request);
  }
}
export default { fetch: handleRequest };
