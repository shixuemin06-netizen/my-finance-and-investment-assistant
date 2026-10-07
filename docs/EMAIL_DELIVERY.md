# 每日邮件日报

邮件出口只使用已经允许公开的材料，不读取个人笔记、手动导入材料或本地私有日报正文。每封最多五个不同事件，保留来源和原始发布日期，分别标记来源摘录、模型摘要及有完整成立条件的判断。标题、摘要与条件不会在发送时再次调用模型。

纯渲染模块是 `lib/digest-email.ts`，可在 Node 或云端 Worker 中导入，不依赖 SQLite、文件系统或 Node API。输入为公开 feed：`articles`、`contentUpdatedAt` 和可选 `snapshotAt`；现有 `/assets/public-data.json` 可直接使用。公开 JSON 尚未包含原文 URL 或判断时，邮件提供本站材料链接；不会猜测原文或补造判断。

固定主题为 `财经阅读日报｜YYYY-MM-DD`，日期采用北京时间的投递业务日期。材料发布时间另外保留。快照长时间未更新或原始发布时间过旧时，标题区直接说明“目前可读材料仍为历史收录”；空快照报告更新情况，不编造当天要点。

## 预览

以下只生成文件，不发送邮件、不启用定时任务：

```powershell
node --import tsx scripts/email-digest.ts preview '--feed=outputs/aihot-review-20261004/public-publish/assets/public-data.json' '--site-url=https://finance-research-shi.shixuemin06.chatgpt.site/' '--date=2026-10-04' '--out=outputs/email-digest-20261004/preview'
```

也可显式使用 `--db=只读快照路径` 代替 `--feed=`。这一模式重新调用与公开网页相同的质量门槛，只读取 `source_type='crawled'` 的内容，数据库始终以只读模式打开。生成 `digest-email.html`、`digest-email.txt` 和机器可读 `digest-email.json`。收件人可以通过 `--recipient=邮箱` 显式加入 JSON。

## 投递与回执

首选已连接的 Gmail 服务与云端定时任务，避免另购邮件供应商或在电脑中保存应用密码。云端任务需要能取得持续更新的公开 feed，不能把本地文件路径当作云端可访问地址。

每次发送前搜索：`in:sent to:收件人 subject:"财经阅读日报｜YYYY-MM-DD"`。找到匹配时读取邮件 ID、收件人和标题核对，记录成功后跳过。同一天重试不更换主题。发送响应超时可能代表邮件已成功发出，先查回执；查不到也不得立即盲目重发。已明确拒绝的请求可按十分钟、三十分钟退避，最多尝试三次。

本地 CLI 的演示账本是单独的 `data/email-outbox.db`，不修改研究数据库 schema。云端可用同样的 `(business_date,recipient)` 唯一键在 D1 中记录；数据库记录与 Gmail 已发送回执共同核对。仅 Gmail 搜索不能独自防住两个同时执行的发送请求，发送前仍需原子认领。

```powershell
# 冻结当天邮件与收件人，只准备，不发送。
node --import tsx scripts/email-digest.ts prepare '--feed=公开feed.json' '--site-url=https://你的站点/' '--date=2026-10-04' '--recipient=本人邮箱' '--out=outputs/email-preview'

# 以下参数来自 prepare / claim 的输出，不是邮件密码。
node --import tsx scripts/email-digest.ts claim '--key=投递key'
node --import tsx scripts/email-digest.ts acknowledge '--key=投递key' '--claim-token=认领token' '--provider-id=Gmail邮件ID'

# 只有供应商明确拒绝才指定 definite=true。默认记为 uncertain。
node --import tsx scripts/email-digest.ts fail '--key=投递key' '--claim-token=认领token' '--error-code=PROVIDER_REJECTED' '--definite=true'
node --import tsx scripts/email-digest.ts status '--key=投递key'
```

`claim` 仅对 ready 或已经过退避的 failed 状态生效，同日同收件人只能有一个发送中请求。sent、sending、uncertain 均不会自动重发。uncertain 保留认领 token，找到已发送回执后可以 acknowledge。进程中断遗留的 sending 记录也先核对回执；绝不按“运行已结束”推断邮件没发出。

本模块借鉴 AIHOT 的投递边界：先冻结负载、原子去重、实际回执区分 sent 与 unknown、结果不明时停止自动重试。AIHOT 原实现是飞书通知，这里没有搬用其品牌或接入飞书。

## 当前验证范围

邮件专项测试覆盖日期跨时区、历史状态、来源/模型区分、同事件去重、HTML转义、未来日期过滤、邮箱头注入、单次认领、成功去重、失败退避和不明回执。命令预览与真实浏览器渲染可验证内容及版式；邮件在 Gmail 客户端的实际显示与送达，需要启用后的供应商回执单独核对。

此文档说明已实现的模块与集成规则。它不表示邮箱已经发送、云端日程已经启用或本地电脑睡眠时仍会执行。
