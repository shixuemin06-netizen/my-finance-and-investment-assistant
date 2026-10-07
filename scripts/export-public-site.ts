/**
 * Produce the isolated, static public edition from one explicitly approved
 * digest. The public folder deliberately contains no SQLite database, API,
 * raw article text, source errors, import queue, or model-generated summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import db from '../lib/db';
import { getBriefItems } from '../lib/research';
import type { BriefItem, DigestRow } from '../lib/types';

type PublicItem = {
  position: number;
  title: string;
  topic: string | null;
  sourceName: string;
  sourceUrl: string;
};

type Publication = {
  issueDate: string;
  issueDisplay: string;
  generatedAt: string;
  totalMaterials: number;
  publicItems: PublicItem[];
};

const arg = process.argv.find((value) => value.startsWith('--date='));
const date = arg?.slice('--date='.length);

if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error('请显式指定 --date=YYYY-MM-DD；公开版不会自动发布最新采集结果。');
}

const digest = db.prepare('SELECT * FROM digests WHERE date = ?').get(date) as DigestRow | undefined;
if (!digest) throw new Error('找不到指定日报：' + date);

const publicItems = getBriefItems(date)
  .map(toPublicItem)
  .filter((item): item is PublicItem => Boolean(item));

if (!publicItems.length) {
  throw new Error('该期没有同时满足“官方一手材料 + 有效原文链接”的项目，拒绝导出公开版。');
}

const publication: Publication = {
  issueDate: date,
  issueDisplay: formatDate(date),
  generatedAt: new Date().toISOString(),
  totalMaterials: Number(digest.article_count || 0),
  publicItems,
};

const root = path.resolve(process.cwd(), 'public-site');
const issueDir = path.join(root, 'issues', date);
const contentDir = path.join(root, 'content');
fs.mkdirSync(issueDir, { recursive: true });
fs.mkdirSync(contentDir, { recursive: true });

fs.writeFileSync(path.join(contentDir, 'publication.json'), JSON.stringify(publication, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'index.html'), renderPage(publication, false), 'utf8');
fs.writeFileSync(path.join(issueDir, 'index.html'), renderPage(publication, true), 'utf8');

console.log('已导出公开静态样刊：' + path.relative(process.cwd(), root));
console.log('公开材料：' + publicItems.length + ' 条官方一手原文；日期：' + date);

function toPublicItem(item: BriefItem): PublicItem | null {
  if (item.evidenceLevel !== 'official') return null;
  const source = item.supportSources.find((candidate) =>
    candidate.tier === 'official' && candidate.isPrimary,
  );
  const sourceUrl = toSafePublicUrl(source?.url);
  if (!source || !sourceUrl) return null;
  return {
    position: item.position,
    title: item.title,
    topic: item.topic,
    sourceName: source.name,
    sourceUrl,
  };
}

function toSafePublicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
    // The PBOC source also serves HTTPS; prefer it from an HTTPS public page.
    if (url.protocol === 'http:' && url.hostname === 'www.pbc.gov.cn') url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function renderPage(data: Publication, archiveOnly: boolean): string {
  const cards = data.publicItems.map((item) => [
    '<article class="record">',
    '  <div class="record-topline"><span class="record-number">0' + item.position + '</span><span class="record-kind">官方一手原文</span></div>',
    '  <p class="record-topic">' + escapeHtml(item.topic || '待归类') + '</p>',
    '  <h2>' + escapeHtml(item.title) + '</h2>',
    '  <p class="record-source">发布机构：' + escapeHtml(item.sourceName) + '</p>',
    '  <p class="record-boundary">本页只提示值得核对的原文，不把标题自动延伸为市场判断或投资建议。</p>',
    '  <a class="source-link" href="' + escapeAttribute(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看官方原文 <span aria-hidden="true">↗</span></a>',
    '</article>',
  ].join('\n')).join('\n');

  const archiveLabel = archiveOnly ? 'ARCHIVE ISSUE' : 'PUBLIC RESEARCH EDITION';
  const returnLink = archiveOnly ? '<a class="back-link" href="/">← 返回公开版首页</a>' : '';
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="robots" content="noindex,nofollow">',
    '  <meta name="description" content="财经观点台账公开样刊：仅展示已筛选的官方一手原文。">',
    '  <meta property="og:title" content="财经观点台账 · 公开样刊">',
    '  <meta property="og:description" content="从原始材料开始，而不是从结论开始。">',
    '  <meta property="og:type" content="website">',
    '  <title>财经观点台账 · 公开样刊</title>',
    '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '  <link rel="stylesheet" href="/assets/public.css">',
    '</head>',
    '<body>',
    '  <main>',
    '    <header class="masthead">',
    '      <a class="brand" href="/"><span class="brand-symbol">观</span><span>财经观点台账</span><i>SHI</i></a>',
    '      <span class="edition">' + archiveLabel + '</span>',
    '    </header>',
    '    <section class="hero" aria-labelledby="site-title">',
    '      <p class="eyebrow">PRIVATE RESEARCH, PUBLIC NOTES</p>',
    '      <h1 id="site-title">从原始材料开始，<br>而不是从结论开始。</h1>',
    '      <p class="hero-copy">这是 ' + escapeHtml(data.issueDisplay) + ' 的公开归档样刊。它只保留可以直接打开的一手官方材料；私人采集、模型处理和未核验线索不在此站展示。</p>',
    '      <div class="hero-meta"><span>第 01 期 · ' + escapeHtml(data.issueDate) + '</span><span>' + data.publicItems.length + ' 条官方原文</span><span>非实时行情</span></div>',
    '      ' + returnLink,
    '    </section>',
    '    <section class="method-note" aria-label="公开边界">',
    '      <p class="eyebrow">PUBLICATION RULE</p>',
    '      <p>本期私人工作台筛选过 ' + data.totalMaterials + ' 条材料；公开页仅展示其中有官方一手链接的 ' + data.publicItems.length + ' 条。未核验内容、自动摘要和投资判断均不公开。</p>',
    '    </section>',
    '    <section class="records" id="records" aria-labelledby="records-title">',
    '      <div class="section-heading"><div><p class="eyebrow">PRIMARY MATERIALS</p><h2 id="records-title">本期可核对材料</h2></div><span>请以原文为准</span></div>',
    cards,
    '    </section>',
    '    <section class="reading-note">',
    '      <p class="eyebrow">HOW TO READ</p>',
    '      <ol><li>先看发布机构与原文日期。</li><li>区分公告事实、市场解读与个人判断。</li><li>任何交易决策都应回到正式披露与自身风险承受能力。</li></ol>',
    '    </section>',
    '    <footer>财经观点台账 · SHI · 公开归档样刊 · 导出于 ' + escapeHtml(formatTimestamp(data.generatedAt)) + '</footer>',
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function formatDate(value: string): string {
  return new Date(value + 'T12:00:00+08:00').toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  });
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (character) => map[character]);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
