import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.FINANCE_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'finance-edition-'));
const {modelConfig}=await import('../lib/model-config');
const {reserveUsage,finishUsage,usageToday}=await import('../lib/model-usage');
const {validateJudgment}=await import('../lib/judgment');
const {extractPublishedDate}=await import('../crawlers/metadata');
const {rankTopics}=await import('../lib/hot-topics');
test('模型白名单与每日额度：并发预留占用额度，未知型号失败关闭',()=>{
 process.env.LLM_PROVIDER='deepseek';process.env.LLM_MODEL='deepseek-flash';process.env.LLM_DAILY_REQUEST_LIMIT='2';process.env.LLM_DAILY_BUDGET_CNY='0.1';
 const id=reserveUsage('材料',100);assert.equal(usageToday().requests,1);assert.ok(usageToday().cost>0);
 finishUsage(id,100,100,'deepseek-flash');assert.equal(usageToday().tokens,200);reserveUsage('第二次',100);
 assert.throws(()=>reserveUsage('第三次',100),/上限/);
 process.env.LLM_MODEL='unknown-pro';assert.throws(()=>modelConfig(),/白名单/);
 process.env.LLM_MODEL='deepseek-flash';process.env.LLM_DAILY_REQUEST_LIMIT='200';process.env.LLM_DAILY_BUDGET_CNY='0';assert.throws(()=>reserveUsage('超预算',100),/预算/);
 process.env.LLM_PROVIDER='zhipu';process.env.LLM_MODEL='glm-5.3-flash';assert.equal(modelConfig().model,'glm-5.3-flash');assert.equal(usageToday().lastStatus,null);
 process.env.LLM_PROVIDER='deepseek';process.env.LLM_MODEL='deepseek-flash';
});
test('未授权发送真实材料时摘要入口不调用模型',async()=>{
 process.env.LLM_PROVIDER='zhipu';process.env.LLM_MODEL='glm-5.3-flash';process.env.ZHIPU_API_KEY='fixture-only';process.env.LLM_REAL_CONTENT_ENABLED='0';
 const {summarizeAll}=await import('../pipeline/summarize');let called=false;
 const done=await summarizeAll(undefined,'fetched_at',1,undefined,async()=>{called=true;throw new Error('must not call model');});
 assert.equal(done,0);assert.equal(called,false);
 delete process.env.ZHIPU_API_KEY;process.env.LLM_PROVIDER='deepseek';process.env.LLM_MODEL='deepseek-flash';
});
test('观点必须引用正文中的真实连续片段；不接受捏造引用',()=>{
 const j={thesis:'条件性判断',mechanism:'传导机制',evidence:'这是正文中的真实引用内容',counterpoint:'竞争性解释',watch:'观察现金流',horizon:'long'};
 assert.ok(validateJudgment(j,'开始。这是正文中的真实引用内容。结束。'));
 assert.equal(validateJudgment(j,'不包含引用的另一篇文章'),undefined);
 assert.equal(validateJudgment({...j,counterpoint:''},j.evidence),undefined);
});
test('发布时间优先明确元数据；不拿正文日期和非法日历充数',()=>{
 assert.equal(extractPublishedDate('<meta property="article:published_time" content="2026-09-11T10:00:00+08:00">'),'2026-09-11');
 assert.equal(extractPublishedDate('<script type="application/ld+json">{"@graph":[{"datePublished":"2026-09-10"}]}</script>'),'2026-09-10');
 assert.equal(extractPublishedDate('<article>会议于2026-09-01举行</article>'),null);
 assert.equal(extractPublishedDate('<meta name="date" content="2026-02-30">'),null);
});
test('热点按报道统计并去重；同标题转载不能刷高报道量',()=>{
 const base={publisher:'甲',url:'https://example.org',fetched_at:'2026-09-13'};
 const result=rankTopics([{...base,id:3,title:'黄金价格上涨！'},{...base,id:2,title:'黄金价格上涨',publisher:'乙'},{...base,id:1,title:'原油供应调整'}]);
 assert.equal(result[0].topic,'大宗商品');assert.equal(result[0].count,2);assert.equal(result[0].sources,1);
});
