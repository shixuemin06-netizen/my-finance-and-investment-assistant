/** Generate a frozen Beijing-date digest, then materialize its research record. */
import db from '../lib/db';
import { materializeDigestResearch } from '../lib/research';
import { beijingToday, beijingDateSql } from '../lib/time';
import type { ArticleRow, DivergenceRow, SummaryRow } from '../lib/types';

export function generateDigest(
  date?: string,
  bucketField: 'fetched_at' | 'published_at' = 'fetched_at',
  frozenIds?: number[],
): void {
  const today = date || beijingToday();
  const dateDisplay = formatDateDisplay(today);
  const articles = frozenIds !== undefined
    ? (frozenIds.length ? db.prepare('SELECT * FROM articles WHERE id IN (' + frozenIds.map(() => '?').join(',') + ') ORDER BY id ASC').all(...frozenIds) as ArticleRow[] : [])
    : db.prepare('SELECT * FROM articles WHERE ' + beijingDateSql(bucketField) + ' = ? ORDER BY id ASC').all(today) as ArticleRow[];
  const ids = articles.map((article) => article.id);
  const summaries = ids.length
    ? db.prepare(`SELECT * FROM summaries WHERE article_id IN (${ids.map(() => '?').join(', ')})`).all(...ids) as SummaryRow[]
    : [];
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const joined = summaries.map((summary) => ({ article: articleById.get(summary.article_id), summary }))
    .filter((row): row is { article: ArticleRow; summary: SummaryRow } => Boolean(row.article));
  const divergences = db.prepare('SELECT * FROM divergence WHERE digest_date = ? ORDER BY id DESC').all(today) as DivergenceRow[];

  const keywordCount: Record<string, number> = {};
  for (const { summary } of joined) {
    for (const tag of safeJsonParse(summary.tags || '[]')) {
      keywordCount[tag] = (keywordCount[tag] || 0) + 1;
    }
  }
  db.prepare('DELETE FROM keywords_trend WHERE date = ?').run(today);
  for (const [keyword, count] of Object.entries(keywordCount)) {
    db.upsert('keywords_trend', { keyword, date: today, count }, ['keyword', 'date'], ['count']);
  }

  let markdown = '# 财经日报\n';
  markdown += `> **${dateDisplay}** ｜ 冻结材料 ${articles.length} 篇，已生成摘要 ${joined.length} 条\n\n`;
  if (divergences.length) {
    markdown += '---\n## 共识与分歧\n\n';
    for (const divergence of divergences) markdown += `${divergence.summary_md || ''}\n\n`;
  }
  if (Object.keys(keywordCount).length) {
    markdown += '---\n## 本期主题\n\n';
    for (const [keyword, count] of Object.entries(keywordCount).sort((left, right) => right[1] - left[1])) {
      markdown += `- **${keyword}**（${count} 条材料）\n`;
    }
    markdown += '\n';
  }
  markdown += '---\n## 材料摘要\n\n';
  for (const { article, summary } of joined) {
    markdown += `### ${article.title}\n`;
    markdown += `**${article.publisher || article.author || '未标注发布机构'}** · ${article.published_at || '发布时间待补'}  \n`;
    markdown += `> ${summary.summary}\n\n`;
    const tags = safeJsonParse(summary.tags || '[]');
    if (tags.length) markdown += `主题：${tags.map((tag: string) => `\`${tag}\``).join(' ')}  \n`;
    markdown += `原文：[查看材料](${article.url})\n\n`;
  }

  const missing = articles.filter(article => !joined.some(row => row.article.id === article.id));
  if (missing.length) {
    markdown += '\n## 待摘要原文\n\n以下材料已保存，尚未生成摘要。\n\n';
    for (const article of missing) markdown += '- [' + article.title.replace(/[\\[\\]]/g, '') + '](' + article.url + ') · ' + (article.publisher || '来源待补') + '\n';
  }
  const topTopics = Object.entries(keywordCount).sort((left, right) => right[1] - left[1]).slice(0, 3).map(([topic]) => topic);
  const oneLiner = !articles.length ? '本期尚无材料，等待采集或导入。'
    : joined.length < articles.length ? '本期 ' + articles.length + ' 条材料，已摘要 ' + joined.length + ' 条；其余可先阅读原文。'
    : '本期 ' + articles.length + ' 条材料，摘要已就绪。' + (topTopics.length ? '关注 ' + topTopics.join('、') + '。' : '');
  const now = new Date().toISOString();
  db.upsert('digests', {
    date: today,
    title: `${dateDisplay} 财经日报`,
    one_liner: oneLiner,
    full_content_md: markdown,
    article_count: articles.length,
    article_ids: JSON.stringify(ids),
    generated_at: now,
  }, ['date'], ['title', 'one_liner', 'full_content_md', 'article_count', 'article_ids', 'generated_at']);

  if (ids.length) {
    db.prepare(`UPDATE articles SET digest_date = ? WHERE id IN (${ids.map(() => '?').join(', ')})`).run(today, ...ids);
  }
  const research = materializeDigestResearch(today);
  console.log(`[日报] 已生成 ${dateDisplay}（冻结 ${articles.length} 篇；三件事 ${research.items}；待核验 ${research.pending}）`);
}

function formatDateDisplay(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai',
  });
}

function safeJsonParse(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}