import cron from 'node-cron';
import { runPipeline } from './lib/status';
console.log('手动启动的调度器：每天 08:00（北京时间）。网页启动器不会启动它。');
cron.schedule('0 8 * * *', () => {
  try { runPipeline(); } catch { console.error('定时任务失败，请检查运行与待办。'); }
}, { timezone: 'Asia/Shanghai' });
process.stdin.resume();
