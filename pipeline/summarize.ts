/**
 * 单篇摘要：读当天未处理的 articles → 调 DeepSeek → 写 summaries 表
 */
import db, { readTable, writeTable } from '../lib/db';
import { summarizeArticle } from '../lib/llm';
import { beijingToday } from '../lib/time';
import type { ArticleRow, SummaryRow } from '../lib/types';

export async function summarizeAll(
  date?: string,
  bucketField: 'fetched_at' | 'published_at' = 'fetched_at'
): Promise<number> {
  const today = date || beijingToday();

  // 读所有 articles 和已有 summaries（JS 侧做 LEFT JOIN）
  const articles = readTable('articles') as ArticleRow[];
  const summaries = readTable('summaries') as SummaryRow[];
  const summarizedIds = new Set(summaries.map((s) => s.article_id));

  let unprocessed = articles.filter((a) => !summarizedIds.has(a.id));

  // 若指定了日期，只处理该日期（按 bucketField 归桶）的未摘要文章
  if (date) {
    unprocessed = unprocessed.filter((a) => (a[bucketField] || '').slice(0, 10) === date);
  }

  if (unprocessed.length === 0) {
    console.log('[摘要] 没有新文章需要处理');
    return 0;
  }

  console.log(`[摘要] 共 ${unprocessed.length} 篇文章待处理`);

  let done = 0;
  for (const a of unprocessed) {
    try {
      console.log(`[摘要] (${done + 1}/${unprocessed.length}) ${a.title.slice(0, 40)}...`);
      const result = await summarizeArticle(
        a.title,
        a.author || '未知',
        a.published_at || today,
        a.raw_text || ''
      );

      // 写入 summaries（INSERT OR REPLACE 模式）
      const existing = summaries.find((s) => s.article_id === a.id);
      if (existing) {
        existing.summary = result.summary;
        existing.tags = JSON.stringify(result.tags);
        existing.stance = result.stance;
        existing.confidence = result.confidence;
        existing.generated_at = new Date().toISOString();
      } else {
        summaries.push({
          id: summaries.length + 1,
          article_id: a.id,
          summary: result.summary,
          tags: JSON.stringify(result.tags),
          stance: result.stance,
          confidence: result.confidence,
          evidence_level: 'unverified',
          generated_at: new Date().toISOString(),
        });
      }

      // 逐篇落盘，中断不丢已完成的进度
      writeTable('summaries', summaries);

      done++;
      // 频率控制
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e: any) {
      console.error(`[摘要] 失败: ${a.title.slice(0, 40)} | ${e.message}`);
    }
  }

  console.log(`[摘要] ✅ 完成 ${done}/${unprocessed.length}`);
  return done;
}
