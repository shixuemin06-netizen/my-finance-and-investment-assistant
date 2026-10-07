/** Local single-user daily pipeline: collect -> dedupe -> summarize -> compare -> freeze -> materialize. */
import { crawlAllAdapters, recordSourceResults, syncSourceRegistry } from '../crawlers/adapters/registry';
import { persistEvidenceLevels } from '../lib/evidence';
import db from '../lib/db';
import {syncStories} from '../lib/stories';
import { getSourcePulse } from '../lib/research';
import { beijingToday } from '../lib/time';
import { finishJob, startJob, type SourceResult, type StageTimings } from '../lib/jobs';
import { analyzeDaily } from './analyze';
import { generateDigest } from './generate';
import { ingestArticles } from './ingest';
import { mergeStagedArticles } from './import';
import { summarizeAll } from './summarize';

async function main() {
  const started = Date.now();
  const today = beijingToday();
  const runId = startJob('daily');
  const timings: StageTimings = {};
  let sourceResults: SourceResult[] = [];
  let newCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    console.log(`\n财经日报流水线启动 [${today}] runId=${runId}\n`);
    syncSourceRegistry();

    const crawlAt = Date.now();
    const crawled = await crawlAllAdapters();
    sourceResults = crawled.sourceResults;
    recordSourceResults(sourceResults);
    timings.crawl = Date.now() - crawlAt;

    const ingestAt = Date.now();
    const stagedCount = await mergeStagedArticles();
    newCount = ingestArticles(crawled.articles);
    skippedCount = Math.max(0, crawled.articles.length - newCount);
    timings.ingest = Date.now() - ingestAt;
    console.log(`[入库] 新增 ${newCount} 篇；采集去重 ${skippedCount} 篇；收件箱合并 ${stagedCount} 篇`);

    try {
      db.backup();
      console.log('[备份] 已创建 SQLite 快照');
    } catch (error: any) {
      // A same-day snapshot may already exist; the active run is still recoverable through WAL.
      console.warn(`[备份] 未新增快照：${error.message}`);
    }

    const summarizeAt = Date.now();
    await summarizeAll(today);
    persistEvidenceLevels();
    timings.summarize = Date.now() - summarizeAt;

    const analyzeAt = Date.now();
    // Cross-article model analysis is deferred; this run stays within five model calls.
    syncStories();
    generateDigest(today);
    timings.analyze = Date.now() - analyzeAt;

    failedCount = sourceResults.filter((result) => !result.ok).length;
    const pulse = getSourcePulse(today);
    finishJob(runId, {
      status: failedCount || pulse.pendingSummaryCount > 0 ? 'partial' : 'success',
      sourceResults,
      stageTimings: timings,
      newCount,
      skippedCount,
      failedCount,
      pendingVerifyCount: pulse.pendingVerifyCount,
    });
    console.log(`流水线完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
  } catch (error: any) {
    failedCount = Math.max(failedCount, sourceResults.filter((result) => !result.ok).length);
    finishJob(runId, {
      status: 'failed',
      sourceResults,
      stageTimings: timings,
      newCount,
      skippedCount,
      failedCount,
      pendingVerifyCount: 0,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error('流水线失败:', error);
  process.exit(1);
});