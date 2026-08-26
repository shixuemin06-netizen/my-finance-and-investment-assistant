/**
 * 状态检测 + 日报补生成 —— 「随时触发」机制
 *
 * 用途：
 *  - 调度器启动时、`启动.bat` 打开系统时调用 runPipelineIfNeeded()，
 *    检查「今日日报」是否已存在，缺失则立刻跑一次流水线补生成。
 *
 * 日期口径：统一用北京时间（见 lib/time.ts），与 pipeline 内一致。
 */
import { execSync } from 'child_process';
import { readTable } from './db';
import { beijingToday } from './time';
import { latestJob } from './jobs';

const RUN_CMD = 'node node_modules/tsx/dist/cli.mjs pipeline/run.ts';

/** 当前「日期」口径（北京时间，YYYY-MM-DD） */
export function todayISO(): string {
  return beijingToday();
}

/** 今日日报是否已生成 */
export function hasTodayDigest(): boolean {
  const digests = readTable('digests') as Array<{ date?: string }>;
  return digests.some((d) => d.date === todayISO());
}

/** 跑一次完整日报流水线（阻塞，输出透传到当前终端） */
export function runPipeline(): void {
  execSync(RUN_CMD, { cwd: process.cwd(), stdio: 'inherit' });
}

/** 状态检测：今日日报缺失则补生成一次；返回是否执行了补生成 */
export function runPipelineIfNeeded(): boolean {
  const today = todayISO();
  if (hasTodayDigest()) {
    console.log(`[状态检测] 今日(${today})日报已存在，跳过`);
    return false;
  }
  console.log(`[状态检测] 今日(${today})无日报，立即执行流水线补生成...`);
  runPipeline();
  return true;
}

/**
 * 顶部状态行：基于最新一次 job_run 汇总真实状态。
 * 例：「数据更新于 08:02 · 5/6 信源正常 · 2 条待核验」
 */
export function getStatusLine(): { text: string; updatedAt: string | null } {
  const job = latestJob();
  if (!job) {
    return { text: '尚未运行过流水线', updatedAt: null };
  }

  let text = '';
  if (job.finished_at) {
    const t = new Date(job.finished_at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    });
    text = `数据更新于 ${t}`;
  }

  const sources = job.source_results ? safeParse(job.source_results) : [];
  if (Array.isArray(sources) && sources.length > 0) {
    const ok = sources.filter((s: any) => s.ok).length;
    text += ` · ${ok}/${sources.length} 信源正常`;
  }

  const pending = job.pending_verify_count ?? 0;
  if (pending > 0) {
    text += ` · ${pending} 条待核验`;
  }

  return { text, updatedAt: job.finished_at };
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return []; }
}
