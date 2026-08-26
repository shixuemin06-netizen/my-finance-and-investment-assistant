/**
 * 一次性迁移：把旧的 data/*.json 数据导入 SQLite（data/invest.db）。
 * 用法：node node_modules/tsx/dist/cli.mjs scripts/migrate-json-to-sqlite.ts
 *
 * 幂等：可重跑。完成后把 JSON 原文件挪到 data/json_backup_<日期>/ 保留。
 */
import fs from 'fs';
import path from 'path';
import { readTable, writeTable } from '../lib/db';
import type { SourceTier } from '../lib/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');

const TABLES = [
  'sources',
  'articles',
  'staged_articles',
  'summaries',
  'divergence',
  'digests',
  'keywords_trend',
];

/** 由旧 author（实为平台名）推导信源等级 */
function deriveTier(author: string | null): SourceTier {
  const a = (author || '').toLowerCase();
  if (a.includes('雪球') || a.includes('xueqiu')) return 'community';
  return 'media';
}

function main() {
  for (const table of TABLES) {
    const fp = path.join(DATA_DIR, `${table}.json`);
    if (!fs.existsSync(fp)) {
      console.log(`[迁移] 跳过 ${table}（无 JSON 文件）`);
      continue;
    }
    const raw = fs.readFileSync(fp, 'utf-8');
    const rows = raw.trim() ? (JSON.parse(raw) as Record<string, any>[]) : [];

    // 文章表：回填新增字段
    if (table === 'articles') {
      for (const r of rows) {
        r.publisher = r.publisher ?? r.author ?? null;
        r.source_tier = r.source_tier ?? deriveTier(r.author);
        r.canonical_url = r.canonical_url ?? r.url ?? null;
        r.is_primary = r.is_primary ?? 0;
        r.digest_date = r.digest_date ?? null;
      }
    }

    writeTable(table, rows);
    console.log(`[迁移] ${table}: ${rows.length} 行`);
  }

  // 备份 JSON 原文件
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backupDir = path.join(DATA_DIR, `json_backup_${stamp}`);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  for (const table of TABLES) {
    const fp = path.join(DATA_DIR, `${table}.json`);
    if (fs.existsSync(fp)) {
      fs.renameSync(fp, path.join(backupDir, `${table}.json`));
    }
  }

  console.log(`\n✅ 迁移完成，JSON 原文件已备份到 data/json_backup_${stamp}/`);

  // 校验
  console.log('\n=== 校验 SQLite 行数 ===');
  for (const table of ['articles', 'summaries', 'digests', 'divergence', 'keywords_trend']) {
    const rows = readTable(table);
    console.log(`  ${table}: ${rows.length} 行`);
  }
}

main();
