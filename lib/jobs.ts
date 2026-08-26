/**
 * 流水线运行记录（job_runs）。
 * 记录每个信源成败、各阶段耗时、本期新增/跳过/失败、模型与版本号。
 */
import { readTable, writeTable } from './db';
import type { JobRunRow } from './types';

export interface StageTimings {
  crawl?: number;
  ingest?: number;
  summarize?: number;
  analyze?: number;
  generate?: number;
}

export interface SourceResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}

const MODEL = 'deepseek-chat';
const PROMPT_VERSION = 'v1';
const DATASET_VERSION = 'v1';

/** 开始一次运行，返回 runId */
export function startJob(runType: JobRunRow['run_type']): number {
  const rows = readTable('job_runs') as JobRunRow[];
  const id = rows.length + 1;
  rows.push({
    id,
    started_at: new Date().toISOString(),
    finished_at: null,
    run_type: runType,
    status: 'running',
    source_results: null,
    stage_timings: null,
    new_count: 0,
    skipped_count: 0,
    failed_count: 0,
    pending_verify_count: 0,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    dataset_version: DATASET_VERSION,
  });
  writeTable('job_runs', rows);
  return id;
}

/** 结束一次运行，写最终状态 */
export function finishJob(
  runId: number,
  opts: {
    status: 'success' | 'failed' | 'partial';
    sourceResults: SourceResult[];
    stageTimings: StageTimings;
    newCount: number;
    skippedCount: number;
    failedCount: number;
    pendingVerifyCount?: number;
  }
): void {
  const rows = readTable('job_runs') as JobRunRow[];
  const job = rows.find((r) => r.id === runId);
  if (!job) return;

  job.finished_at = new Date().toISOString();
  job.status = opts.status;
  job.source_results = JSON.stringify(opts.sourceResults);
  job.stage_timings = JSON.stringify(opts.stageTimings);
  job.new_count = opts.newCount;
  job.skipped_count = opts.skippedCount;
  job.failed_count = opts.failedCount;
  job.pending_verify_count = opts.pendingVerifyCount ?? 0;
  writeTable('job_runs', rows);
}

/** 最新一次运行（供 UI 状态行使用） */
export function latestJob(): JobRunRow | undefined {
  const rows = readTable('job_runs') as JobRunRow[];
  if (rows.length === 0) return undefined;
  return rows.reduce((a, b) => (a.id > b.id ? a : b));
}
