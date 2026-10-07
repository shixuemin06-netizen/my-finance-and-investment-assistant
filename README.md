# 财经观点台账

2026-10-04 本轮精简重复的统计和说明，补全独立采集与每日邮件出口。本地自动运行任务已安装并完成真实更新；同一公开站点的 version 6 已发布成功。2026-10-07 复检：公网更新接口仍返回 Cloudflare 403，云端更新和邮件日程未启用，尚未发送邮件。使用与核验边界见 [自动更新说明](docs/AUTOMATIC_UPDATES.md)，版本回执见 [部署说明](DEPLOY_PUBLIC.md)。此前 version 5 的对照记录保存在 Git 历史，见 [文档索引](docs/README.md)。

中国优先、覆盖主要经济体的个人宏观与产业阅读工具。本轮为单人本地完整版本，商业账户与支付尚未接入。

## 打开与使用

公开阅读入口：[财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。个人笔记、收藏和管理功能仍在本地工作台。

本地自动采集已经由 Windows 监管任务接管，无需为更新反复双击文件。需要使用本地工作台时，双击 **启动.bat**，默认打开 http://127.0.0.1:3099 ；重复启动复用现有服务，修改网页配置后使用 **重启.bat**。关闭网页服务不会停止独立采集进程。
Node.js 22.13+，推荐 Node.js 24。新克隆先运行 npm ci。
端口冲突时在 .env.local 设置 FINANCE_PORT；启动器不接管其他应用。

五个入口：今日总览、宏观趋势、产业前沿、财经日报、我的研究。先发现事件，进入详情核对原文，再关注与记笔记。事件详情的“标记本次已读”保存当前版本，之后新增材料或摘要会提示新进展。
旧文章收藏和笔记仍可访问，取消收藏不删除笔记。我的研究支持 Markdown 导出。
管理入口位于侧栏底部；手机端进入“更多”。
邮件配置入口为本地 `/admin/email`，`/api/email-preview` 可预览当天邮件内容；预览不发送邮件、不启用日程。

## 更新与模型费用

已安装的项目专属监管任务在登录、每小时、系统恢复和解锁时检查独立 worker，失活时补启；不打开浏览器、不启动常驻网页。任务使用当前登录会话，注销后不运行。
这台电脑采用 Modern Standby，睡眠时普通 Node 程序仍会暂停；恢复后只补查一次，不重放错过的小时。任务不强制唤醒电脑，也不改变电源计划。

version 6 的云端公开版使用 D1 缓存，按小时检查固定的九个官方来源；普通页面读取已保存的公开资料，更新和邮件渲染不调用模型。云端与本地研究库分开：不上传全量原文、个人笔记、手动导入材料或私有日报，不把本地自动采集结果直接同步上网。部署已确认成功；公网更新通路受 Cloudflare 403 阻挡，云端日程尚未启用。

采集无需模型。新材料优先摘要，每批最多 5 篇，每轮最多 40 篇；旧档案不自动付费重做。
沿用当前模型配置、每日预算和请求上限；默认每天 1 元、200 次请求。限流、认证失败、预算耗尽时停止本轮模型处理，保留原文与已有摘要，不自动提高预算或更换模型。
没有密钥仍可采集、搜索、阅读和记笔记。配置使用 .env.local，不把密钥提交到仓库。个人笔记不进入模型请求。
禁用本地采集可设置 FINANCE_DISABLE_WORKER=1，后台在下次检查时停止；监管任务的安装、状态和撤销命令见 [自动更新说明](docs/AUTOMATIC_UPDATES.md)。普通 npm run dev 只启动开发网页。

邮件默认每天北京时间 08:00 发至本人已连接的 Gmail；具体地址只保存在私有设置中。任务启用、成功执行和邮件送达分别核验，同日同收件人去重；当前尚待原生启用，不能以已有预览或本地配置代替送达回执。

## 页面与证据边界

事件由规范化原始链接或明确的同次政策会议标识关联；同主题、不同月份或会议不会自动合并。规则会漏分，不以模糊合并换取表面完整。
来源陈述、模型解读与个人笔记分开。报道数量不是经济影响评分，也不是独立证据数量。翻译保留原标题，缺失日期明确标注。
历史日报与分享链接保持有效；/matrix、/notebook、/archive、/review、/hot 跳转至新版对应入口。

- [页面地图与数据架构](docs/PRODUCT.md)
- [统一视觉规范](docs/DESIGN.md)
- [自动运行与邮件出口](docs/AUTOMATIC_UPDATES.md)
- [来源与历史更新记录](docs/SOURCES-AND-UPDATES.md)
- [来源使用权限](docs/SOURCE_RIGHTS.md)
- [文档索引与历史记录](docs/README.md)

## 开发与验证

~~~powershell
node scripts/local.mjs start --no-open
node scripts/local.mjs doctor
node scripts/local.mjs worker-status
node --import tsx --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
$env:FINANCE_BUILD_DIR='.next-production'
node node_modules/next/dist/bin/next build --webpack
node --import tsx scripts/qa-reader.ts
~~~

qa-reader 使用独立临时数据库、虚构材料和 3199 端口，结束后关闭自己的测试进程；不调用模型。测试不代表所有来源长期可用。
Next.js、React、SQLite 保持现有技术栈，生产构建可使用独立 FINANCE_BUILD_DIR，避免干扰开发服务。

## 文件与发布

数据：data/invest.db；日志：logs/web.log、logs/worker.log、logs/background-task.log 与 background-launch 日志；私有配置：.env.local、data/automation-settings.json。
历史 SQLite 快照集中保存在 data/backups/history/；真实数据仅存本地。
源码新增表，不改写历史 events / claims 的日期语义。
历史静态样刊位于 _archive/site-history/，仅作旧记录；当前公开阅读版见 cloud-reader/。未来商业化仍需真实用户验证。

## 公开阅读版（2026-09-26）
该次交付已发布：[财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。当时的公开版包含资讯、日报和搜索，使用独立静态快照；手动导入、私人笔记、收藏关注和管理 API 留在本地。2026-10-04 的云端更新机制以 [自动更新说明](docs/AUTOMATIC_UPDATES.md) 为准。
首页与阅读规则见 [产品说明](docs/PRODUCT.md) 和 [视觉规范](docs/DESIGN.md)，公开更新方式见 [部署说明](DEPLOY_PUBLIC.md)。示例配置使用 GLM-5.3-Flash，真实材料开关需显式启用。

## 文件整理

现役说明集中在 docs/，旧方案与阶段验收放在 Git 历史。参考 PDF 位于 resources/references/，KYC 材料位于 resources/private/；二者不提交到公开仓库。构建缓存与临时调试文件可删除，数据库、凭证和私人笔记不得混入提交。整理结果见 [清理记录](docs/CLEANUP.md)。
