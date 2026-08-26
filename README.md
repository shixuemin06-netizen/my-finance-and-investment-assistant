# Finance Daily

本地运行的财经信息筛选与观点台账 MVP。它用于抓取公开来源、保存原文链接、生成摘要和横向比较；不构成投资建议，也不应替代原始公告、研究报告或独立判断。

## 本仓库包含

- Next.js / React / TypeScript 前端与 API
- 采集、去重、摘要、分析和日报流水线
- SQLite 表结构、来源配置与自动调度脚本
- 核心测试和产品方案文档

为避免上传密钥、个人运行记录和可能受版权保护的转载内容，仓库不包含 `.claude/` 配置、SQLite 运行库/备份、日志、构建产物或参考资料目录。新克隆项目会在首次运行时基于 `data/schema.sql` 创建本地数据库。

## 本地启动

要求 Node.js 22.5 或更高版本。

```powershell
npm ci
$env:DEEPSEEK_API_KEY = "your_key"
node .\node_modules\next\dist\bin\next dev -H 127.0.0.1 --port 3099
```

也可以在已设置 `DEEPSEEK_API_KEY` 的命令行中运行 `启动.bat`，它会启动前端和定时任务。

## 常用命令

```powershell
npm test
npm run digest
npm run import
```

`sources.json` 里的来源是待持续核验的采集配置；采集到的内容、模型摘要和“共识/分歧”结果均应回到原始来源验证。
