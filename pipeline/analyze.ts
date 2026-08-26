/**
 * 每日横向比较：读当天所有 summaries → 合并调 DeepSeek → 写 divergence 表
 */
import db, { readTable, writeTable } from '../lib/db';
import { compareDaily } from '../lib/llm';
import { beijingToday } from '../lib/time';
import type { ArticleRow, SummaryRow, DivergenceRow } from '../lib/types';

export async function analyzeDaily(
  date?: string,
  bucketField: 'fetched_at' | 'published_at' = 'fetched_at'
): Promise<void> {
  const today = date || beijingToday();

  // JS 侧 JOIN：读 articles + summaries
  const articles = readTable('articles') as ArticleRow[];
  const summaries = readTable('summaries') as SummaryRow[];

  // 严格按归桶字段筛选「本期」文章（不再用 generated_at 回退，避免旧文章算入今日）
  const recentArticles = articles.filter((a) => {
    const d1 = (a[bucketField] || '').slice(0, 10);
    return d1 === today;
  });

  const recentIds = new Set(recentArticles.map((a) => a.id));
  const todaySummaries = summaries.filter((s) => recentIds.has(s.article_id));

  // 关联文章信息
  const joined = todaySummaries.map((s) => {
    const a = articles.find((a) => a.id === s.article_id);
    return { ...s, author: a?.author || null, title: a?.title || '', url: a?.url || '' };
  });

  if (joined.length === 0) {
    console.log('[分析] 今天没有摘要，跳过横向比较');
    return;
  }

  console.log(`[分析] 共 ${joined.length} 条摘要，准备横向比较...`);

  const summariesText = joined
    .map(
      (r, i) =>
        `${i + 1}. 【${r.author || '未知'}】${r.title}\n   摘要：${r.summary}\n   标签：${r.tags || '无'} | 倾向：${r.stance || 'neutral'}`
    )
    .join('\n\n');

  const markdown = await compareDaily(summariesText);

  // 写入 divergence
  const divergences = readTable('divergence') as DivergenceRow[];
  // 删旧
  const filtered = divergences.filter((d) => d.digest_date !== today);

  filtered.push({
    id: divergences.length + 1,
    digest_date: today,
    topic: '今日分析',
    bullish_authors: JSON.stringify([]),
    bearish_authors: JSON.stringify([]),
    summary_md: markdown,
    created_at: new Date().toISOString(),
  });

  writeTable('divergence', filtered);
  console.log(`[分析] ✅ 已写入分析结果`);
}
