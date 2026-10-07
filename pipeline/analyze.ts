/** Generate one scoped consensus/divergence note for a frozen Beijing-date bucket. */
import db from '../lib/db';
import { compareDaily } from '../lib/llm';
import { beijingToday } from '../lib/time';

export async function analyzeDaily(
  date?: string,
  bucketField: 'fetched_at' | 'published_at' = 'fetched_at',
): Promise<void> {
  const today = date || beijingToday();
  const joined = db.prepare(`
    SELECT s.*, a.author, a.publisher, a.title, a.url
    FROM summaries s JOIN articles a ON a.id = s.article_id
    WHERE substr(a.${bucketField}, 1, 10) = ?
    ORDER BY a.id ASC
  `).all(today) as Array<Record<string, any>>;

  if (!joined.length) {
    db.prepare('DELETE FROM divergence WHERE digest_date = ?').run(today);
    console.log('[分析] 今天没有摘要，跳过横向比较');
    return;
  }
  console.log(`[分析] 共 ${joined.length} 条摘要，准备横向比较...`);
  const summariesText = joined.map((row, index) =>
    `${index + 1}. 【${row.author || row.publisher || '未知发布机构'}】${row.title}\n   摘要：${row.summary}\n   标签：${row.tags || '无'} | 倾向：${row.stance || 'neutral'}`,
  ).join('\n\n');
  const markdown = await compareDaily(summariesText);

  db.transaction(() => {
    db.prepare('DELETE FROM divergence WHERE digest_date = ?').run(today);
    db.prepare(`
      INSERT INTO divergence (digest_date, topic, bullish_authors, bearish_authors, summary_md, created_at)
      VALUES (?, '今日分析', '[]', '[]', ?, ?)
    `).run(today, markdown, new Date().toISOString());
  });
  console.log('[分析] 已写入分析结果');
}