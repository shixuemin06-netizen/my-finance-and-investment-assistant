import db from '@/lib/db';
import { syncStories } from '@/lib/stories';
import { modelConfigured, realContentEnabled } from '@/lib/model-config';
import { usageToday } from '@/lib/model-usage';
import { isLocalMutation } from '@/lib/local-request';
import { getSourcePulse, parseArticleIds } from '@/lib/research';
import { startJob, finishJob, type SourceResult } from '@/lib/jobs';
import { generateDigest } from '@/pipeline/generate';
import { beijingToday } from '@/lib/time';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!isLocalMutation(request)) return Response.json({ error: '请从本地网页发起操作。' }, { status: 403 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: '请求格式有误' }, { status: 400 }); }
  if (!['collect', 'summarize'].includes(body?.action)) return Response.json({ error: '未知操作' }, { status: 400 });
  if (body.action === 'summarize' && !modelConfigured()) return Response.json({ error: '模型配置不可用，请检查服务商、模型名与本地密钥。' }, { status: 409 });
  if (body.action === 'summarize' && !realContentEnabled()) return Response.json({ error: '真实材料的模型处理当前暂停；材料仍可采集和阅读。' }, { status: 409 });
  let runId: number; try { runId = startJob('manual'); } catch { return Response.json({ error: '已有任务正在运行，请稍候。' }, { status: 409 }); }
  let sourceResults: SourceResult[] = []; let newCount = 0; const began = Date.now();
  try {
    let done = 0; let remaining = 0; let message = ''; let failed = 0; let targetDate = beijingToday();
    if (body.action === 'collect') {
      const { crawlAllAdapters, recordSourceResults, syncSourceRegistry } = await import('@/crawlers/adapters/registry');
      const { ingestArticles } = await import('@/pipeline/ingest');
      const { mergeStagedArticles } = await import('@/pipeline/import');
      syncSourceRegistry();
      const collected = await crawlAllAdapters(); sourceResults = collected.sourceResults; recordSourceResults(sourceResults);
      newCount = ingestArticles(collected.articles); newCount += await mergeStagedArticles();
      generateDigest(targetDate);
      failed = sourceResults.filter(s => !s.ok).length;
      message = '新增 ' + newCount + ' 条材料。' + (failed ? failed + ' 个信源采集失败，已保存成功材料。' : '采集完成。') + ' 未调用摘要模型。';
    } else {
      targetDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : getSourcePulse().digestDate || targetDate;
      const digest = db.prepare('SELECT article_ids FROM digests WHERE date=?').get(targetDate);
      const ids = parseArticleIds(digest?.article_ids);
      const { summarizeAll } = await import('@/pipeline/summarize');
      done = await summarizeAll(targetDate, 'fetched_at', 5, ids);
      generateDigest(targetDate, 'fetched_at', ids);
      remaining = getSourcePulse(targetDate).pendingSummaryCount;
      failed = remaining > 0 ? 1 : 0;
      message = '本次完成 ' + done + ' 条摘要，本期还剩 ' + remaining + ' 条。' + (!done && remaining ? '请查看下方模型状态。失败材料会冷却 10 分钟，不会重复立即请求。' : '');
    }
    if (body.action === 'summarize' && !done && usageToday().lastStatus?.includes('429')) message += ' 服务商限流或模型繁忙，请稍后再试。';
    syncStories();
    const pulse = getSourcePulse(targetDate);
    finishJob(runId, { status: failed || pulse.pendingSummaryCount ? 'partial' : 'success', sourceResults, stageTimings: { generate: Date.now() - began }, newCount, skippedCount: 0, failedCount: failed, pendingVerifyCount: pulse.pendingVerifyCount });
    return Response.json({ ok: true, message, done, remaining });
  } catch (error) {
    console.error('[manual-run]', error instanceof Error ? error.name : 'error');
    finishJob(runId, { status: 'failed', sourceResults, stageTimings: {}, newCount, skippedCount: 0, failedCount: 1 });
    return Response.json({ error: '本次任务未完成，已保存的材料不会丢失。请检查网络或本地服务配置后重试。' }, { status: 502 });
  }
}
