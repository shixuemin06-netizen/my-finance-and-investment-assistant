/**
 * SQLite 数据库 —— 基于 Node 内置 node:sqlite（Node >= 22.5，本项目运行在 24.x）
 *
 * 优点：零原生依赖、Windows 免编译、事务保证崩溃不损坏（替代旧 JSON 整文件覆盖）。
 *
 * 对外保留两套接口，pipeline / 页面零改动：
 *   - readTable(table) / writeTable(table, rows)：整表读 / 整表覆盖写
 *   - db.prepare(sql).all() / .get() / .run()：标准 SQLite 语句（与 better-sqlite3 同名）
 *
 * 数据文件：data/invest.db（WAL 模式，多进程读写安全）。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'invest.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const rawDb = new DatabaseSync(DB_PATH);
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA busy_timeout = 5000;');
// 应用在 JS 侧维护 id 关联（旧 JSON 库无外键概念），关闭 SQLite 外键约束，
// 使 writeTable 的「DELETE + 重插」语义与旧版一致。
rawDb.exec('PRAGMA foreign_keys = OFF;');

// ===== 表结构 =====

function tableExists(table: string): boolean {
  const row = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function getColumns(table: string): string[] {
  const rows = rawDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function initDatabase(): void {
  const schemaPath = path.resolve(process.cwd(), 'data', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    rawDb.exec(schema);
  }
}

// ===== 数据读写 =====

function readTable(table: string): Record<string, any>[] {
  if (!tableExists(table)) return [];
  return toPlainRows(rawDb.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
}

/** node:sqlite 返回 null 原型对象，转成普通对象（否则无法传给 Client Component） */
function toPlainRows(rows: unknown[]): Record<string, any>[] {
  return rows.map((r) => ({ ...(r as Record<string, any>) }));
}

/**
 * 整表覆盖写：事务内 DELETE + 批量 INSERT。
 * 行对象含什么键就写什么列（键名须与表列一致），其余列落到 schema 默认值。
 */
function writeTable(table: string, rows: Record<string, any>[]): void {
  if (!tableExists(table)) {
    initDatabase();
  }
  const cols = getColumns(table);
  if (cols.length === 0) return;

  const insertSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const insert = rawDb.prepare(insertSql);
  const del = rawDb.prepare(`DELETE FROM ${table}`);

  rawDb.exec('BEGIN');
  try {
    del.run();
    for (const row of rows) {
      insert.run(...cols.map((c) => row[c] ?? null));
    }
    rawDb.exec('COMMIT');
  } catch (e) {
    rawDb.exec('ROLLBACK');
    throw e;
  }
}

// ===== 公共 API（模仿 better-sqlite3） =====

type RunResult = { changes: number; lastInsertRowid: number | bigint };

function prepare(sql: string) {
  const stmt = rawDb.prepare(sql);
  return {
    all(...params: any[]): Record<string, any>[] {
      return toPlainRows(stmt.all(...params) as unknown as unknown[]);
    },
    get(...params: any[]): Record<string, any> | undefined {
      const row = stmt.get(...params);
      return row == null ? undefined : ({ ...(row as Record<string, any>) } as Record<string, any>);
    },
    run(...params: any[]): RunResult {
      return stmt.run(...params) as unknown as RunResult;
    },
    bind(...params: any[]) {
      return prepareBound(sql, params);
    },
  };
}

function prepareBound(sql: string, binds: any[]) {
  const stmt = rawDb.prepare(sql);
  return {
    all(): Record<string, any>[] {
      return toPlainRows(stmt.all(...binds) as unknown as unknown[]);
    },
    get(): Record<string, any> | undefined {
      const row = stmt.get(...binds);
      return row == null ? undefined : ({ ...(row as Record<string, any>) } as Record<string, any>);
    },
    run(): RunResult {
      return stmt.run(...binds) as unknown as RunResult;
    },
  };
}

/** 在线备份到 data/backups/invest-<日期>.db（安全：不阻塞读写） */
function backup(destPath?: string): void {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const target = destPath || path.join(backupDir, `invest-${stamp}.db`);
  rawDb.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
}

// ===== 初始化 =====
initDatabase();

const db = {
  prepare,
  exec(sql: string): void {
    rawDb.exec(sql);
  },
  backup,
};

export default db;
export { readTable, writeTable };
