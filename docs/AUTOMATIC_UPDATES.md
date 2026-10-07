# 自动更新与每日邮件

2026-10-07 复检：本地独立采集仍在运行。version 6 已于 2026-10-04 13:52（北京时间）发布成功，但通过 Sites 官方服务授权请求公开更新接口仍返回 Cloudflare 403；云端 cloud_state 无更新记录，Sites automations 为空。云端按小时更新及每日邮件尚未启用，也未发送测试邮件。

## 本地研究工作台

项目任务 `FinanceReader-a13c6325d781787e` 在当前用户登录、每小时、系统恢复事件和解锁时检查独立 worker。worker 失活时自动补启，同一项目只运行一个采集进程；修改程序时保留正在执行的请求，空闲后再替换进程。任务隐藏运行，启动采集不打开浏览器、不启动网页服务，关闭本地网页服务也不停止采集。

任务使用当前用户的登录会话，无需保存 Windows 密码。锁屏仍有会话，注销后任务不运行。电脑进入 Modern Standby 时，普通 Node 桌面程序会暂停，恢复后补查一次；错过的小时不积累成多次重放。任务的 `WakeToRun=false`，没有改变电源计划或强制唤醒睡眠。Windows 对 Modern Standby 桌面程序的行为见 [微软说明](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/integrating-apps-with-modern-standby)。睡眠期间的定点更新需要云端任务承担；当前云端更新通路尚未通过验收，因此暂不能保证睡眠期间持续更新。

本地采集沿用 `.env.local` 的现有来源、模型与开关；预算仍为每天 1 元、最多 200 次请求。每批最多五篇，每轮最多四十篇，仅处理近期材料，已有摘要和旧档案不自动付费重做。来源失败彼此隔离，预算、认证或限流限制不会自动提高额度。云端公开采集和邮件渲染没有模型调用，这部分不消耗本地模型预算。

使用本地笔记、收藏和管理页面时仍可打开 `启动.bat`；这只是打开工作台，日常采集已由监管任务接管。

```powershell
# 查看 worker 与已安装任务；不启动网页、不打开浏览器。
node scripts/local.mjs worker-status
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/configure-background-task.ps1 -Mode Status

# 新电脑或重建任务时安装并立即检查一次。
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/configure-background-task.ps1 -Mode Install -StartNow

# 只撤销本项目未来的自动启动与监管触发。
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/configure-background-task.ps1 -Mode Remove
```

撤销监管任务不会终止已经运行的采集。需要停止采集时，在私有 `.env.local` 中设置 `FINANCE_DISABLE_WORKER=1`；后台下次检查时停止，并保存已经完成的内容。恢复时设为 `0`，重新安装任务或运行 `node scripts/local.mjs worker`。这里的 PowerShell 执行策略参数只作用于该次命令，不修改全机策略。

日志在 `logs/worker.log`、`logs/background-task.log`、`logs/background-launch.out.log` 和 `logs/background-launch.err.log`。任务返回码表示监管启动器是否成功，采集效果需另外核对 `job_runs`、来源结果和收录时间。

## 云端公开阅读版

公开地址保持为 [财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。version 6 使用 Site Worker 与 D1：已审阅的公开投影作为基线，新增官方材料保存在云端公开缓存中。原有分享链接与材料标识保留。

固定来源为国家统计局、人民银行、证监会、美联储、欧洲央行、日本央行、美国劳工统计局的就业与 CPI 两路，以及美国能源信息署，共九路。更新入口只检查代码中允许的来源，最多每小时一次；租约阻止并发重复采集。同一正文重复出现时不推进资料收录时间，不把一次检查冒充新消息。

普通网页及公开 feed 读取已保存的缓存；`/api/edition` 是固定来源的到期检查入口，`/api/status` 报告实际检查回执。资料缺失、来源失败或缓存故障时保留可读历史页面；页面分别显示检查状态与资料收录时间。未知、无效和未来日期以及不足正文的材料不能直接发布，来源失败不由虚构摘要填补。

云端采集不调用模型，仅发布通过质量门槛的来源摘录。原有已核对的模型摘要和条件判断可保留其来源标识，云端不会补造新判断。D1 只保存允许公开的材料字段，不上传完整原文、密钥、个人笔记、收藏、手动导入材料或本地私有日报。两边分别更新：本地研究材料不会自动变成公开内容。

当前运行状态：version 6 原生部署已成功；公网更新入口仍受 Cloudflare 403 阻挡，按小时云端日程未启用。Worker 本地测试通过不等于线上采集成功。最终版本与部署回执见 [部署说明](../DEPLOY_PUBLIC.md)。

## 每日邮件出口

拟定每天北京时间 08:00 发给本人已连接的 Gmail；该计划当前未启用。具体收件地址只保存在私有设置与任务配置中，不写入公开文档或公开站点。邮件使用云端公开 feed，每封最多五个不同事件，保留真实发布日期、来源入口和阅读链接；旧资料和空快照明确说明实际更新状态。

本地管理入口是 [邮件日报](http://127.0.0.1:3099/admin/email)，[今日预览](http://127.0.0.1:3099/api/email-preview) 仅生成内容，不发送邮件。公开 Worker 的 `/api/email-digest` 提供同一渲染模块的结果，发送时不额外调用模型、不读取私有研究内容。

当前邮件云任务尚待原生启用。本地 outbox 可实现同日同收件人原子认领；拟定云端 Gmail 投递另以已发送回执和已有草稿核对去重，不宣称云端原子投递。实际送达以 Gmail 已发送邮件的收件人、主题和邮件 ID 核对。结果不明时先查回执，不盲目重发。任务已启用、任务已执行和邮件已送达是三个状态，预览或本地显示的配置不能替代它们。模块和去重细节见 [邮件投递说明](EMAIL_DELIVERY.md)。

## 本轮验证

本地任务读回为已启用、隐藏运行、`StartWhenAvailable=true`、`WakeToRun=false`，最后启动器返回码为 `0`。网页服务未启动时，独立采集完成 job 87：新增 66 篇、生成九份摘要，20 路来源中 17 路成功；BLS 两路和 IMF 返回 403，任务明确记录为 `partial`，没有遗留 `running` 记录。数据库检查正常，预算保持原值。详细记录见 [本地运行核验](../outputs/automation-upgrade-20261004/local-runtime-verification.json)。

本轮已通过 123 项自动测试、TypeScript 检查和 Next.js 生产构建。页面验收包含 30 项响应式检查、13 项 axe 检查和三项键盘流程；Worker 本地验收覆盖八个页面，云缓存十一项测试包含真实 SQLite 租约 SQL、并发、回滚、历史链接保留和故障降级。测试与本地回归不证明原生云日程已启用或邮件已送达，后两项以实际回执单独核验。
