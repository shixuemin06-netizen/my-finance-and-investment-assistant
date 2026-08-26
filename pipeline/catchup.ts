/**
 * 状态检测入口脚本 —— 打开系统时调用，缺今日日报则补生成
 * 用法：node node_modules/tsx/dist/cli.mjs pipeline/catchup.ts
 */
import { runPipelineIfNeeded } from '../lib/status';

runPipelineIfNeeded();
