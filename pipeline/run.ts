/**
 * 全流程一键执行脚本
 * 用法：npx tsx pipeline/run.ts
 *
 * 顺序：信源采集（适配器）→ 入库去重 → 摘要 → 横向比较 → 日报生成
 */
import { crawlAllAdapters } from '../crawlers/adapters/registry';
import { ingestArticles } from './ingest';
import db from '../lib/db';
import { summarizeAll } from './summarize';
import { analyzeDaily } from './analyze';
import { generateDigest } from './generate';
import { startJob, finishJob, type StageTimings } from '../lib/jobs';
import { mergeStagedArticles } from './import';
import { computeEvidenceLevels } from '../lib/evidence';
import { readTable } from '../lib/db';
import type { ArticleRow, SummaryRow } from '../lib/types';

async function main() {
  const t0 = Date.now();
  const runId = startJob('daily');
  const stageTimings: StageTimings = {};
  console.log(`\n📋 日报流水线启动 [${new Date().toISOString()}]  runId=${runId}\n`);

  // ===== 1. 数据采集 =====
  console.log('━'.repeat(50));
  console.log('【1/5】数据采集');
  console.log('━'.repeat(50));
  const { articles, sourceResults } = await crawlAllAdapters();
  const t1 = Date.now();

  console.log('\n  ▸ 暂存区合并...');
  let stagedCount = 0;
  try { stagedCount = await mergeStagedArticles(); } catch (e: any) { console.error(`  暂存合并失败: ${e.message}`); }

  console.log(`\n  📥 本次采集: ${articles.length} 篇 + 暂存 ${stagedCount} 篇`);

  // ===== 2. 去重入库 =====
  console.log('\n' + '━'.repeat(50));
  console.log('【2/5】入库去重');
  console.log('━'.repeat(50));
  const newCount = ingestArticles(articles);
  const t2 = Date.now();

  // ===== 3. 备份 =====
  console.log('\n' + '━'.repeat(50));
  console.log('【3/5】数据库备份');
  console.log('━'.repeat(50));
  try { db.backup(); console.log('  已备份'); }
  catch (e: any) { console.error(`  备份失败: ${e.message}`); }

  // ===== 4. 单篇摘要 =====
  console.log('\n' + '━'.repeat(50));
  console.log('【4/5】AI 单篇摘要');
  console.log('━'.repeat(50));
  await summarizeAll();
  const t3 = Date.now();

  // ===== 5. 横向比较 + 日报生成 =====
  console.log('\n' + '━'.repeat(50));
  console.log('【5/5】AI 横向比较 + 日报生成');
  console.log('━'.repeat(50));
  await analyzeDaily();

  // 证据等级计算（在写日报前，用完整文章+摘要集合）
  computeEvidenceLevels(
    readTable('articles') as ArticleRow[],
    readTable('summaries') as SummaryRow[]
  );

  generateDigest();
  const t4 = Date.now();

  stageTimings.crawl = t1 - t0;
  stageTimings.ingest = t2 - t1;
  stageTimings.summarize = t3 - t2;
  stageTimings.analyze = t4 - t3; // 含横向比较 + 日报生成

  const failedSources = sourceResults.filter((r) => !r.ok).length;
  finishJob(runId, {
    status: failedSources > 0 ? 'partial' : 'success',
    sourceResults,
    stageTimings,
    newCount,
    skippedCount: articles.length - newCount,
    failedCount: failedSources,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ 流水线完成  [${new Date().toISOString()}]  耗时 ${elapsed}s\n`);
}

main().catch((e) => {
  console.error('流水线失败:', e);
  process.exit(1);
});
