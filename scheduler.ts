/**
 * 调度器 —— 常驻进程，每天 8:00 自动跑日报流水线
 * 用法：npx tsx scheduler.ts
 *
 * 启动时会先做一次「状态检测」：若今日日报缺失则立刻补生成，
 * 避免「电脑没开 / 定时没赶上」导致当天没有日报。
 */
import cron from 'node-cron';
import { runPipeline, runPipelineIfNeeded } from './lib/status';

console.log('⏰ 调度器已启动');
console.log('   日报流水线: 每天 08:00 (Asia/Shanghai)');
console.log('   按 Ctrl+C 退出\n');

// ===== 启动时状态检测：今日日报缺失则补生成 =====
runPipelineIfNeeded();

// 每天早上 8:00
cron.schedule(
  '0 8 * * *',
  () => {
    console.log(`\n📋 [${new Date().toISOString()}] 定时触发日报流水线`);
    try {
      runPipeline();
      console.log(`✅ [${new Date().toISOString()}] 定时日报完成`);
    } catch (e: any) {
      console.error(`❌ [${new Date().toISOString()}] 流水线失败:`, e.message);
    }
  },
  {
    timezone: 'Asia/Shanghai',
  }
);

// 保持进程存活
process.stdin.resume();
