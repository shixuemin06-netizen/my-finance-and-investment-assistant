/**
 * 补生成指定日期的日报（按 published_at 归桶）
 * 用法：node node_modules/tsx/dist/cli.mjs pipeline/backfill.ts 2026-08-14 2026-08-15
 *
 * 与 run.ts 的区别：
 *  - run.ts 按「抓取日期」归桶，只生成「今天」的日报；
 *  - backfill 按「发布时间 published_at」归桶，重建历史某天的日报。
 *
 * 局限：只能从当前仍可抓到的源里重建，量会比当天实际少。属于「补录」而非「原样还原」。
 */
import { crawlAllAdapters } from '../crawlers/adapters/registry';
import { ingestArticles } from './ingest';
import { summarizeAll } from './summarize';
import { analyzeDaily } from './analyze';
import { generateDigest } from './generate';
import { startJob, finishJob } from '../lib/jobs';
import { computeEvidenceLevels } from '../lib/evidence';
import { readTable } from '../lib/db';
import type { ArticleRow, SummaryRow } from '../lib/types';

async function main() {
  const dates = process.argv.slice(2).filter(Boolean);
  if (dates.length === 0) {
    console.error('用法: node node_modules/tsx/dist/cli.mjs pipeline/backfill.ts <date1> <date2> ...（YYYY-MM-DD）');
    process.exit(1);
  }
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`非法日期: ${d}`);
      process.exit(1);
    }
  }

  const runId = startJob('backfill');
  console.log(`\n📋 补录流水线启动，目标日期: ${dates.join(', ')}\n`);

  console.log('【1/4】数据采集');
  const { articles, sourceResults } = await crawlAllAdapters();
  const newCount = ingestArticles(articles);

  console.log('\n【2/4】AI 摘要（处理所有未摘要文章）');
  await summarizeAll();

  console.log('\n【3/4】按发布时间归桶生成日报');
  for (const d of dates) {
    console.log(`\n  ▸ 生成 ${d} 日报...`);
    await analyzeDaily(d, 'published_at');
    computeEvidenceLevels(
      readTable('articles') as ArticleRow[],
      readTable('summaries') as SummaryRow[]
    );
    generateDigest(d, 'published_at');
  }

  finishJob(runId, {
    status: sourceResults.some((r) => !r.ok) ? 'partial' : 'success',
    sourceResults,
    stageTimings: {},
    newCount,
    skippedCount: articles.length - newCount,
    failedCount: sourceResults.filter((r) => !r.ok).length,
  });

  console.log(`\n✅ 补录完成: ${dates.join(', ')}\n`);
}

main().catch((e) => {
  console.error('补录失败:', e);
  process.exit(1);
});
