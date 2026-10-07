# 当前发布状态（2026-10-07 复检）

当前公开地址：[财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。version 6 已于 2026-10-04T05:52:09Z（北京时间 13:52）原生部署成功，源提交为 `7d1fa2775f5c664588a4bdd4d6c3087f48fb5a93`，部署 ID 为 `appgdep_6ac1e9610960819199d11a1367374fc3`。本版精简重复报告信息，并加入独立的官方来源 Worker/D1 缓存与邮件内容渲染模块。

公开基线仍为 1,199 条材料、1,171 个事件及 18 期日报。2026-10-07 使用 Sites 官方服务授权访问 `/api/edition` 返回 Cloudflare 403；线上 `cloud_state` 表无更新回执，Sites 日程列表为空。因此，云端自动采集和邮件发送尚未启用，不能将本地 Worker 验收或部署成功当作上线更新成功。证据见 `outputs/automation-upgrade-20261004/cloud-live-verification.json`，运行边界见 [自动更新说明](docs/AUTOMATIC_UPDATES.md)。

以下 version 5 与更早内容保留为历史复现记录，不能代表当前发布状态。
# 公开阅读版部署

当前公开地址：[财经观点台账](https://finance-research-shi.shixuemin06.chatgpt.site)。AIHOT 对照复检后的 **version 5** 已发布，提交标识 `4880e257c796283e059aa8b0cd02c1e9fa832a73`，原生发布状态 succeeded（2026-10-04T00:38:31Z，北京时间 08:38）。本版为 2026-10-04T00:13:18.151Z 的整理快照；原始材料发布日期截至 2026-09-30，最近收录为北京时间 10 月 1 日 00:40。页面上线日期与资讯日期分别显示。

## 当前版本复现（2026-10-04）

本版公开产物为 `outputs/aihot-review-20261004/public-publish`，来源为 `outputs/aihot-review-20261004/release-db/invest.db`，1,199 条材料、1,171 个事件、18 期日报。数据库 SHA-256 为 `e641c62473acb6f81e840bbdac1339c2a8f26fde3acd19e804515fbfc05f91a4`。此前公开的 865 条材料全部保留，另增加 334 条；未通过检查的材料保留待核地址。

```powershell
node --import tsx scripts/export-reader-public.ts '--db=outputs/aihot-review-20261004/release-db/invest.db' '--out=outputs/aihot-review-20261004/public-replay' '--site-url=https://finance-research-shi.shixuemin06.chatgpt.site' '--snapshot-at=2026-10-04T00:13:18.151Z' '--expected-db-sha256=e641c62473acb6f81e840bbdac1339c2a8f26fde3acd19e804515fbfc05f91a4'
```

导出目录必须全新且为空。当前验收位于 `outputs/aihot-review-20261004/qa-publish/`；冷缓存性能与交互补充见同目录上级的 `qa-public/`。归档 `site-version5.tar.gz` 含 2,643 个文件，其中 2,642 个公开文件与验收输出逐文件一致，另一个为托管 manifest。版本 ID 为 `appgprj_6ab78c736be881919bb40c9df0e4434c~appgver_5391b2ded858819187265f43487e84a4`，部署 ID 为 `appgdep_6ac19fe43ce88191a78585c59a3f2cc0`。

本轮修复只在副本发生，原库业务记录未改变；重新从默认原库导出不能复现本版。准备副本的来源比对过程、数据限制和验收见 [AIHOT 对照复检](docs/REVIEW-AIHOT-20261004.md)。下文的 9 月 26 日、version 4 数据与命令保留为历史重放说明。

此站是独立静态阅读版，包含通过质量门槛的公开采集材料、条件判断、去重事件、摘要/标注的原文短引、日报与搜索。**手动导入、私人日报正文、笔记、收藏关注、数据库、密钥和管理 API 不上传。** 不要把本地 Next.js 工作目录、审计报告或数据库目录直接部署到公网。

公开站是定期发布的资料快照，网站可全天访问已发布内容。采集与模型处理仍在本地，电脑关闭则停止；新材料需本地更新、导出、验证后重新发布。页面分别展示快照生成时间、最近收录与原始发布日期，不提供实时行情或云端实时采集。

## 本轮候选与数据边界

本轮发布产物：`outputs/product-maturity-20260929/public-ready`，快照时间 `2026-09-26T11:46:06.088Z`（北京时间 19:46），865 材料、848 去重事件。来源是 `outputs/quality-upgrade-20260926/working-db/invest.db`，不是原库。

**自动审批曾拒绝原库大批量变更，原库批量写回仍待用户答复；正文批量修复只在副本执行。** 直接从默认 `data/invest.db` 重新导出会读到尚未批量修复的原档案，不能声称复现本轮候选。正文、旧生成失效和质量状态的明细留在内部审计目录。

## 重新导出与验收

导出是只读操作，必须显式指定数据库、全新空目录和目标站点根地址。下面的命令固定 9 月 26 日已验收副本及其 SHA-256，用于复现该期内容；不能把重新打包的时间称作新增材料时间：

```powershell
& 'D:\SHI\AI工具\node.exe' --import tsx scripts/export-reader-public.ts '--db=outputs/quality-upgrade-20260926/working-db/invest.db' '--out=outputs/product-maturity-20260929/public-replay' '--site-url=https://finance-research-shi.shixuemin06.chatgpt.site' '--snapshot-at=2026-09-26T11:46:06.088Z' '--expected-db-sha256=e0706263b52d4658c54a2c52be17fa3fc7ccf4b3ee252a7c2ab6734b0a11cfb1'
```

导出时重新计算正文/摘要/分类门槛，不只信任旧质量状态；仅查询 `source_type=crawled`，使用公开字段允许清单与公开 URL 检查。日报仅采用允许的材料 ID 重建，不读取私人日报正文。失败材料的旧分享地址保留“材料待核对”页，同源事件的旧地址引导归并页。非空输出目录、源数据库哈希不符或存在未归档 WAL 时导出会停止。

2026-09-29 的公开版改进在 `outputs/product-maturity-20260929/public-ready`：首页只将带明确条件且不属于背景观察的判断列为重点，其余同期材料进入线索区；页面增加规范链接与分享元信息。逐材料商用权利仍未核完，因此 sitemap 目前只列站点入口和阅读说明，其余页面标为 `noindex,follow`。搜索标记仅控制曝光，不代表取得使用许可。

先检查公开产物，再发布：

```powershell
& 'D:\SHI\AI工具\node.exe' scripts/qa-public-quality.mjs '--root=outputs/product-maturity-20260929/public-replay' '--out=outputs/product-maturity-20260929/qa-replay'
& 'D:\SHI\AI工具\node.exe' scripts/qa-public-interactions.mjs '--root=outputs/product-maturity-20260929/public-replay' '--out=outputs/product-maturity-20260929/qa-replay'
```

验收脚本使用本机 Playwright / Chromium；axe 验证工具位于 `tmp/qa-tools/axe.min.js`，仅用于开发检查，不是公开产品依赖。若该文件缺失，应按脚本参数提供经校验的 axe 文件。生成完整内部报告与前后截图，响应式覆盖 390/768/1440px，隐私检查只在内存比较真实密钥值。报告、数据库、`.env.local` 和 `tmp` 不属于发布包。

本轮发布产物的最终验收见 [QA-ready](outputs/product-maturity-20260929/qa-ready/public-quality-acceptance.json)；其 LCP/CLS 是本地冷缓存实验室数据，不是线上 RUM 第 75 百分位或真实 INP。

## 托管与兼容

只把已经验收的静态输出上传到既有托管项目。既有项目标识保存在 `outputs/public-release-20260926/site/.openai/hosting.json`；该目录是托管专用 checkout，其 `dist` 已替换为本轮 `public-ready`，保留可选缩略图。托管版本 4 从提交 `731881cb8eb83daa954e7f51c5517c6acd11aff2` 打包并发布。已核对该发布目录不含私有资料；只推送静态 `dist` 与托管 manifest，不推送真实项目仓库、数据库或内部报告。不要未经检查混入旧文件，凭证不写入页面或提交到仓库。

当前托管域名可直接分享。绑定自有域名需要已有域名及 DNS 配置，本轮没有购买域名。原 `public-site` 与 `scripts/export-public-site.ts` 是历史官方样刊入口，保留兼容，不用于本次公开站。

质量、数据与阅读改造见 [本轮质量升级](docs/QUALITY-UPGRADE-20260926.md)；商业使用权限见 [来源条款核验](docs/SOURCE-RIGHTS-20260926.md)。质量通过不等于授权通过，正式收费前仍需逐来源与逐材料核查许可。
