/** One-off, repeatable local migration for existing frozen digests. */
import fs from 'fs';
import path from 'path';
import db from '../lib/db';
import { materializeDigestResearch } from '../lib/research';
import { recordSourceResults, syncSourceRegistry } from '../crawlers/adapters/registry';
import { latestJob } from '../lib/jobs';
import type { DigestRow } from '../lib/types';

function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.resolve(process.cwd(), 'data', 'backups', `invest-before-research-v2-${stamp}.db`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  db.backup(backup);
  console.log(`[backfill] snapshot: ${backup}`);
  syncSourceRegistry();
  const latest = latestJob();
  if (latest?.source_results) {
    try {
      const results = JSON.parse(latest.source_results);
      if (Array.isArray(results)) recordSourceResults(results, latest.finished_at || latest.started_at || new Date().toISOString());
    } catch {
      console.warn('[backfill] latest source result is not valid JSON; source health remains unset');
    }
  }
  const digests = db.prepare('SELECT * FROM digests ORDER BY date ASC').all() as DigestRow[];
  for (const digest of digests) {
    const result = materializeDigestResearch(digest.date);
    console.log(`[backfill] ${digest.date}: ${result.claims} claims, ${result.items} brief items, ${result.pending} pending`);
  }
  console.log(`[backfill] complete: ${digests.length} digests`);
}

main();