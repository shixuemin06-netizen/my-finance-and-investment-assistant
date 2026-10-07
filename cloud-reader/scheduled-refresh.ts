import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPublicEdition, type PublicEdition } from '../lib/public-edition';
import { createPublicReader } from '../lib/public-reader-ui';
import { publicReaderClientScript } from '../lib/public-reader-client';
import { beijingDay } from '../lib/overview-window';
import { fetchCloudSources, type CloudSourceResult } from './feeds';
import { mergeEdition, publicSearchData, type StoredMaterial, type RefreshReceipt } from './store';

export function applySourceCheck(seed: PublicEdition, result: CloudSourceResult, now: number) {
  const accepted = buildPublicEdition(result.rows, [], new Date(now).toISOString());
  const byUrl = new Map(seed.articles.map(a => [a.url, a]));
  const ids = new Set(seed.articles.map(a => a.id));
  const additions: StoredMaterial[] = [];
  let added = 0, revised = 0;
  for (const candidate of accepted.articles) {
    const old = byUrl.get(candidate.url);
    // A fresh extractor fingerprint alone is not proof that a reviewed analysis needs replacing.
    if (old && (old.summary || old.judgment)) continue;
    const unchanged = old?.basisFingerprint === candidate.basisFingerprint;
    if (old && unchanged && old.factExcerpt === candidate.factExcerpt) continue;
    let id = old?.id || candidate.id;
    if (!old) { while (ids.has(id)) id++; ids.add(id); }
    const article = { ...candidate, id, eventId: old?.eventId || 'cloud-' + id.toString(36),
      oldEventId: old?.oldEventId || candidate.oldEventId,
      ...(old && unchanged ? { fetchedAt: old.fetchedAt, title: old.title, originalTitle: old.originalTitle,
        summary: old.summary, judgment: old.judgment, generatedAt: old.generatedAt, basisKind: old.basisKind } : {}) };
    const previousEvent = old && seed.events.find(e => e.id === old.eventId);
    const event = previousEvent ? { ...previousEvent,
      ...(previousEvent.representativeArticleId === id ? { title: article.title } : {}),
      latestAt: article.publishedAt && Date.parse(article.publishedAt) > Date.parse(previousEvent.latestAt || '') ? article.publishedAt : previousEvent.latestAt }
      : { id: article.eventId, title: article.title, articleIds: [id], representativeArticleId: id,
        region: article.region, sector: article.sector, theme: article.theme, firstAt: article.publishedAt,
        latestAt: article.publishedAt, sourceFamilyCount: 1, independence: 'unverified' };
    additions.push({ article, event });
    byUrl.set(article.url, article);
    if (old) revised++; else added++;
  }
  const status = result.sources.every(s => s.status === 'failed') ? 'failed'
    : result.sources.every(s => s.status === 'ok') ? 'success' : 'partial';
  const receipt: RefreshReceipt = { checkedAt: new Date(now).toISOString(), added, revised, sources: result.sources, status };
  return { edition: mergeEdition(seed, additions), receipt };
}

export async function runScheduledRefresh(root = process.cwd(), now = Date.now()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.openai/hosting.json'), 'utf8'));
  if (manifest.project_id !== 'appgprj_6ab78c736be881919bb40c9df0e4434c') throw Error('Unexpected public Site');
  const assets = path.join(root, 'public/assets');
  const seed: PublicEdition = JSON.parse(fs.readFileSync(path.join(assets, 'edition-seed.json'), 'utf8'));
  const receiptPath = path.join(assets, 'source-check.json');
  const previous: RefreshReceipt | null = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
  const { edition, receipt } = applySourceCheck(seed, await fetchCloudSources(now), now);
  // Save one daily heartbeat even without new material. Never advance content dates merely for a check.
  const publishNeeded = receipt.added > 0 || receipt.revised > 0 || !previous
    || beijingDay(previous.checkedAt) !== beijingDay(receipt.checkedAt)
    || previous.status !== receipt.status;
  if (!publishNeeded) return { publishNeeded, receipt, contentUpdatedAt: seed.contentUpdatedAt, articles: seed.articles.length };
  const write = (relative: string, value: string) => {
    const destination = path.join(root, 'public', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, value);
  };
  write('assets/edition-seed.json', JSON.stringify(edition));
  write('assets/source-check.json', JSON.stringify(receipt));
  write('assets/public-data.json', JSON.stringify(publicSearchData(edition, receipt)));
  write('assets/reader.js', publicReaderClientScript());
  const ui = createPublicReader(edition, '<img src="/reader/cutout-4-faa830732ac5.webp" alt="" width="32" height="34">',
    'https://finance-research-shi.shixuemin06.chatgpt.site', { mode: 'cloud', checkedAt: receipt.checkedAt, updateStatus: receipt.status });
  write('index.html', ui.home());
  for (const view of ['macro', 'industry', 'search'] as const) write(view + '/index.html', ui.filterPage(view));
  write('about/index.html', ui.shell('阅读与更新说明', 'about', ui.about(), '', '/about/'));
  write('settings/index.html', ui.shell('阅读设置', 'about', ui.settings(), '', '/settings/'));
  if (edition.issues[0]) write('daily/index.html', ui.shell('财经日报', 'daily', ui.issueBody(edition.issues[0]), '', '/daily/'));
  for (const a of edition.articles) write('articles/' + a.id + '/index.html', ui.shell(a.title, a.sector === 'macro' ? 'macro' : 'industry', ui.articleBody(a), '', '/articles/' + a.id + '/'));
  for (const e of edition.events) write('events/' + e.id + '/index.html', ui.shell(e.title, e.sector === 'macro' ? 'macro' : 'industry', ui.eventBody(e), '', '/events/' + e.id + '/'));
  for (const issue of edition.issues) for (const route of ['daily', 'digest', 'share']) write(route + '/' + issue.date + '/index.html', ui.shell(issue.date + ' 财经日报', 'daily', ui.issueBody(issue), '', '/' + route + '/' + issue.date + '/'));
  return { publishNeeded, receipt, contentUpdatedAt: edition.contentUpdatedAt, articles: edition.articles.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScheduledRefresh().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
