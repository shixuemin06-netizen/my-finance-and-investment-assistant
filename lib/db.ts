/**
 * SQLite data access layer (Node 24 node:sqlite).
 *
 * Legacy whole-table helpers remain temporarily for old routes, but the live
 * pipeline uses transaction/upsert so a failed run cannot erase history.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.FINANCE_DATA_DIR ? path.resolve(process.env.FINANCE_DATA_DIR) : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'invest.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const rawDb = new DatabaseSync(DB_PATH);
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA busy_timeout = 5000;');
// Historic JSON imports have dangling relationships. New writes keep order,
// while this compatibility setting prevents existing local data from failing to open.
rawDb.exec('PRAGMA foreign_keys = OFF;');

type PlainRow = Record<string, any>;
type RunResult = { changes: number; lastInsertRowid: number | bigint };

function tableExists(table: string): boolean {
  const row = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function getColumns(table: string): string[] {
  if (!tableExists(table)) return [];
  return (rawDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
}

/** Add only missing source columns so existing SQLite files stay intact. */
function migrateExistingSchema(): void {
  if(tableExists('job_runs')&&!getColumns('job_runs').includes('owner_pid'))rawDb.exec('ALTER TABLE job_runs ADD COLUMN owner_pid INTEGER');
  if (!tableExists('sources')) return;
  const existing = new Set(getColumns('sources'));
  const additions: Array<[string, string]> = [
    ['source_key', 'TEXT'],
    ['source_tier', "TEXT DEFAULT 'media'"],
    ['is_primary', 'INTEGER DEFAULT 0'],
    ['authority_level', 'INTEGER DEFAULT 2'],
    ['topic_scope', 'TEXT'],
    ['last_run_at', 'TEXT'],
    ['last_success_at', 'TEXT'],
    ['last_status', 'TEXT'],
    ['last_error', 'TEXT'],
    ['last_count', 'INTEGER DEFAULT 0'],
  ];

  for (const [column, definition] of additions) {
    if (!existing.has(column)) rawDb.exec(`ALTER TABLE sources ADD COLUMN ${column} ${definition}`);
  }
  rawDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_source_key ON sources(source_key)');
}

function initDatabase(): void {
  const schemaPath = path.resolve(process.cwd(), 'data', 'schema.sql');
  if (fs.existsSync(schemaPath)) rawDb.exec(fs.readFileSync(schemaPath, 'utf-8'));
  migrateExistingSchema();
  const continuousSchema=path.resolve(process.cwd(),'data','stories.sql');
  if(fs.existsSync(continuousSchema)) rawDb.exec(fs.readFileSync(continuousSchema,'utf8'));
}

/** node:sqlite returns null-prototype rows; Client Components need plain objects. */
function toPlainRows(rows: unknown[]): PlainRow[] {
  return rows.map((row) => ({ ...(row as PlainRow) }));
}

function readTable(table: string): PlainRow[] {
  if (!tableExists(table)) return [];
  return toPlainRows(rawDb.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as unknown[]);
}

/**
 * Compatibility-only whole-table replacement. Do not use this in the live
 * crawler/summarizer path; new code should use transaction + upsert.
 */
function writeTable(table: string, rows: PlainRow[]): void {
  if (!tableExists(table)) initDatabase();
  const columns = getColumns(table);
  if (!columns.length) return;

  const insert = rawDb.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  );
  const del = rawDb.prepare(`DELETE FROM ${table}`);

  transaction(() => {
    del.run();
    for (const row of rows) insert.run(...columns.map((column) => row[column] ?? null));
  });
}

function transaction<T>(fn: () => T): T {
  rawDb.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    rawDb.exec('COMMIT');
    return result;
  } catch (error) {
    rawDb.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Controlled incremental upsert. Columns are intersected with the real schema
 * before composing SQL, so callers cannot inject SQL identifiers through data.
 */
function upsert(table: string, row: PlainRow, conflictColumns: string[], updateColumns?: string[]): RunResult {
  if (!tableExists(table)) initDatabase();
  const allowed = new Set(getColumns(table));
  const columns = Object.keys(row).filter((column) => allowed.has(column));
  if (!columns.length) throw new Error(`没有可写入 ${table} 的列`);
  if (conflictColumns.some((column) => !allowed.has(column))) throw new Error(`无效冲突列：${table}`);

  const updates = (updateColumns ?? columns.filter((column) => !conflictColumns.includes(column)))
    .filter((column) => allowed.has(column) && !conflictColumns.includes(column));
  const action = updates.length
    ? `UPDATE SET ${updates.map((column) => `${column}=excluded.${column}`).join(', ')}`
    : 'NOTHING';
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${conflictColumns.join(', ')}) DO ${action}`;
  return rawDb.prepare(sql).run(...columns.map((column) => row[column] ?? null)) as unknown as RunResult;
}

function prepare(sql: string) {
  const statement = rawDb.prepare(sql);
  return {
    all(...params: any[]): PlainRow[] {
      return toPlainRows(statement.all(...params) as unknown as unknown[]);
    },
    get(...params: any[]): PlainRow | undefined {
      const row = statement.get(...params);
      return row == null ? undefined : { ...(row as PlainRow) };
    },
    run(...params: any[]): RunResult {
      return statement.run(...params) as unknown as RunResult;
    },
    bind(...params: any[]) {
      return prepareBound(sql, params);
    },
  };
}

function prepareBound(sql: string, binds: any[]) {
  const statement = rawDb.prepare(sql);
  return {
    all(): PlainRow[] {
      return toPlainRows(statement.all(...binds) as unknown as unknown[]);
    },
    get(): PlainRow | undefined {
      const row = statement.get(...binds);
      return row == null ? undefined : { ...(row as PlainRow) };
    },
    run(): RunResult {
      return statement.run(...binds) as unknown as RunResult;
    },
  };
}

/** Online SQLite snapshot. Caller should choose a dated name for auditability. */
function backup(destPath?: string): void {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const target = destPath || path.join(backupDir, `invest-${stamp}.db`);
  rawDb.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
}

initDatabase();

const db = {
  prepare,
  exec(sql: string): void {
    rawDb.exec(sql);
  },
  backup,
  transaction,
  upsert,
};

export default db;
export { readTable, writeTable };