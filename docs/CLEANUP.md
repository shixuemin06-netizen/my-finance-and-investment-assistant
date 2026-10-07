# 文件整理记录 · 2026-10-07

已删除 6790 个可重建或一次性文件，约 1186.1 MiB：旧 Next.js 构建缓存、旧托管 checkout 的 node_modules、临时调试脚本/截图、隔离测试库及多余快捷方式。当前运行数据库、凭证、现役依赖、日志和当前发布产物保留。

真实历史 SQLite 快照及其 WAL/SHM 已移至 data/backups/history/，移动前后 SHA-256 一致；旧 JSON 数据备份移至 data/backups/legacy-json-20260822/。KYC 与参考 PDF 移至 resources/ 并排除版本控制。原始业务内容未改写。

旧产品方案和阶段报告只保留在 Git 提交 91d6384 中，现役文档由 docs/README.md 索引。

验证：128 项现有测试通过，TypeScript 检查通过。文件整理未发布网站，未重新核验线上运行。

待决：公开仓库 origin/main 推送被自动审批拒绝，须明确确认公开发布新增源码与文档；整个历史 _archive 清空也被拒绝，现仅清除其中可重建缓存，其余旧输出待确认后清除。两项尚未完成。
