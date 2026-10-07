# 当前发布状态（2026-10-07 复检）

当前公开地址：[财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。version 6 已于 2026-10-04T05:52:09Z（北京时间 13:52）原生部署成功，源提交为 `7d1fa2775f5c664588a4bdd4d6c3087f48fb5a93`，部署 ID 为 `appgdep_6ac1e9610960819199d11a1367374fc3`。本版精简重复报告信息，并加入独立的官方来源 Worker/D1 缓存与邮件内容渲染模块。

公开基线仍为 1,199 条材料、1,171 个事件及 18 期日报。2026-10-07 使用 Sites 官方服务授权访问 `/api/edition` 返回 Cloudflare 403；线上 `cloud_state` 表无更新回执，Sites 日程列表为空。因此，云端自动采集和邮件发送尚未启用，不能将本地 Worker 验收或部署成功当作上线更新成功。证据见 `outputs/automation-upgrade-20261004/cloud-live-verification.json`，运行边界见 [自动更新说明](docs/AUTOMATIC_UPDATES.md)。

## 当前工作入口

云端源码与运行边界见 [cloud-reader](cloud-reader/README.md)，本地采集与邮件见 [自动更新说明](docs/AUTOMATIC_UPDATES.md)。当前发布产物位于 outputs/automation-upgrade-20261004/；2026-10-07 云端任务准备现场位于 outputs/cloud-schedule-20261007/，准备包不能作为部署完成证明。本次文件整理未重新部署或复核线上状态。

## 公开边界

公开站仅使用经筛选的采集材料公开字段、短摘录及已审核解读。私人笔记、手动导入、私人日报、完整数据库和密钥留在本地。Git 源码推送与网站发布分别验证，不能把源码提交当作线上已更新。来源权利核验见 [来源使用权限](docs/SOURCE_RIGHTS.md)。

## 历史版本复现

历史方案与各轮验收正文保存在 Git 提交 `91d6384` 中，不再保留平行的本地文档。可用 `git show 91d6384:原文件路径` 查看。历史记录中的产物路径仅表示当时现场，不能作为当前可用文件入口。

历史 version 5 发布数据库：data/backups/history/aihot-review-20261004-release-db/invest.db；历史 9 月 26 日质量副本：data/backups/history/quality-upgrade-20260926-working-db/invest.db。数据库及 WAL/SHM 均保留在本地；重放前按原记录校验数据库哈希，并检查 WAL，使用全新输出目录。Git 不保存这些私有数据库。

静态公开产物可用 scripts/export-reader-public.ts 导出，scripts/qa-public-quality.mjs 与 scripts/qa-public-interactions.mjs 验收。axe 依赖保留在 tmp/qa-tools/axe.min.js。云端包使用 cloud-reader/ 的工作流。旧托管 checkout 和静态版本说明在上述 Git 历史中。
