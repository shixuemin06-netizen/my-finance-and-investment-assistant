import { execFileSync } from 'node:child_process';
import db from './db';
import { getSourcePulse } from './research';
import { beijingToday } from './time';
import { contentLabels } from './delivery';
export function todayISO() { return beijingToday(); }
export function hasTodayDigest() { return Boolean(db.prepare('SELECT id FROM digests WHERE date = ?').get(todayISO())); }
export function runPipeline() {
  execFileSync(process.execPath, ['--env-file-if-exists=.env.local', 'node_modules/tsx/dist/cli.mjs', 'pipeline/run.ts'], { cwd: process.cwd(), stdio: 'inherit', shell: false, windowsHide: true });
}
export function runPipelineIfNeeded() {
  if (hasTodayDigest()) return false;
  runPipeline(); return true;
}
export function getStatusLine(date?: string) {
  const pulse = getSourcePulse(date);
  const text = pulse.digestDate ? pulse.digestDate + ' · ' + (pulse.stale ? '历史一期 · ' : '') + contentLabels[pulse.contentState] : '尚无简报 · 可导入材料';
  return { text, updatedAt: pulse.updatedAt, pulse };
}
