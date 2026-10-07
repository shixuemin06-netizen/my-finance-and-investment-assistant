/** Durable, incremental pipeline run records. */
import db from './db';
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

import { modelConfig } from './model-config';
const PROMPT_VERSION = 'v2-evidence-contract';
const DATASET_VERSION = 'v2-frozen-digest';
const STALE_RUN_MS = 3 * 60 * 60 * 1000;

/** Start one run and fail fast if a fresh run already owns the local pipeline. */
export function startJob(runType: JobRunRow['run_type']): number {
  return db.transaction(() => {
  const now = new Date();
  for(const job of db.prepare("SELECT id,owner_pid FROM job_runs WHERE status='running' AND owner_pid IS NOT NULL").all()){
    try{process.kill(Number(job.owner_pid),0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')db.prepare("UPDATE job_runs SET status='failed',finished_at=? WHERE id=?").run(now.toISOString(),job.id);}
  }
  const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();
  db.prepare(`
    UPDATE job_runs
    SET status = 'failed', finished_at = ?, source_results = COALESCE(source_results, '[]')
    WHERE status = 'running' AND started_at < ?
  `).run(now.toISOString(), staleBefore);

  const running = db.prepare("SELECT id FROM job_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1").get();
  if (running) throw new Error(`已有运行中的流水线（runId=${running.id}），请等待或确认其状态`);

  const result = db.prepare(`
    INSERT INTO job_runs (
      started_at, run_type, status, source_results, stage_timings,
      new_count, skipped_count, failed_count, pending_verify_count,
      model, prompt_version, dataset_version
    ) VALUES (?, ?, 'running', NULL, NULL, 0, 0, 0, 0, ?, ?, ?)
  `).run(now.toISOString(), runType, modelConfig().model, PROMPT_VERSION, DATASET_VERSION);
  db.prepare('UPDATE job_runs SET owner_pid=? WHERE id=?').run(process.pid,Number(result.lastInsertRowid));
  return Number(result.lastInsertRowid);
  });
}

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
  },
): void {
  db.prepare(`
    UPDATE job_runs
    SET finished_at = ?, status = ?, source_results = ?, stage_timings = ?,
        new_count = ?, skipped_count = ?, failed_count = ?, pending_verify_count = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    opts.status,
    JSON.stringify(opts.sourceResults),
    JSON.stringify(opts.stageTimings),
    opts.newCount,
    opts.skippedCount,
    opts.failedCount,
    opts.pendingVerifyCount ?? 0,
    runId,
  );
}

export function latestJob(): JobRunRow | undefined {
  return db.prepare('SELECT * FROM job_runs ORDER BY id DESC LIMIT 1').get() as JobRunRow | undefined;
}