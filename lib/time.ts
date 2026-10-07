/**
 * 北京时间工具。统一口径，避免 UTC 日期偏移（原代码用 toISOString().slice(0,10) 取的是 UTC 日期，
 * 在北京时间 00:00–08:00 之间会差一天）。
 */

/** 北京时间的今天，YYYY-MM-DD */
export function beijingToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 把任意可解析的日期字符串归一化为 YYYY-MM-DD（北京时间口径）；解析失败返回 null */
export function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  // 已经是 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** SQL bucket for ISO timestamps (legacy local timestamps retain their local date). */
export function beijingDateSql(column: string): string {
  if (!/^(a\.)?(fetched_at|published_at)$/.test(column)) throw new Error('Unsupported date column');
  return "CASE WHEN " + column + " LIKE '%Z' OR " + column + " LIKE '%+__:__' THEN date(" + column + ", '+8 hours') ELSE substr(" + column + ", 1, 10) END";
}

/** 北京时间的当前 ISO 时间戳（用于 fetched_at / generated_at） */
export function beijingNow(): string {
  return new Date().toISOString();
}
