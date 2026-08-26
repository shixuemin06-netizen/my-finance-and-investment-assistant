/**
 * 续跑补录：跳过采集，仅对指定日期做「摘要 → 分析 → 生成日报」
 * 用法：node node_modules/tsx/dist/cli.mjs pipeline/resume.ts 2026-08-14 2026-08-15
 *
 * 适用于 backfill.ts 在采集后中断的场景（采集已入库，摘要/生成未完成）。
 * 幂等：已摘要的文章会被跳过；日报按 published_at 归桶重建。
 */
import { summarizeAll } from './summarize';
import { analyzeDaily } from './analyze';
import { generateDigest } from './generate';

async function main() {
  const dates = process.argv.slice(2).filter(Boolean);
  if (dates.length === 0) {
    console.error('用法: node node_modules/tsx/dist/cli.mjs pipeline/resume.ts <date1> <date2> ...（YYYY-MM-DD）');
    process.exit(1);
  }

  for (const d of dates) {
    console.log(`\n━━━ 处理 ${d} ━━━`);
    await summarizeAll(d, 'published_at');
    await analyzeDaily(d, 'published_at');
    generateDigest(d, 'published_at');
  }

  console.log(`\n✅ 续跑完成: ${dates.join(', ')}\n`);
}

main().catch((e) => {
  console.error('续跑失败:', e);
  process.exit(1);
});
