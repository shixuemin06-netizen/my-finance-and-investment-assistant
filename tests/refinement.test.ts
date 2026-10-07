import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {overviewWindow} from '../lib/overview-window';import {validateJudgment} from '../lib/judgment';
process.env.FINANCE_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'finance-refine-'));delete process.env.ZHIPU_API_KEY;delete process.env.DEEPSEEK_API_KEY;
const {default:db}=await import('../lib/db');const {ingestArticles}=await import('../pipeline/ingest');
test('今日窗口以北京时间发布日选择，不填入旧会议、无日期或未来新闻',()=>{
 const now=Date.parse('2026-09-26T04:00:00Z');const mk=(date:string|null)=>({published_at:date,latest_at:date||new Date(now).toISOString()});
 const rows=[mk('2026-09-25T18:00:00Z'),mk('2026-09-17T00:00:00Z'),mk(null),mk('2026-09-26T08:00:00Z')];
 const w=overviewWindow(rows,now);assert.equal(w.items.length,1);assert.equal(w.label,'今日发布');assert.equal(w.historical,false);
 const fallback=overviewWindow([rows[1]],now);assert.equal(fallback.historical,true);assert.equal(fallback.day,'2026-09-17');
});
test('偏多偏空必须带资产与条件，历史判断兼容且不从作者stance推断方向',()=>{
 const quote='测试原文中的真实依据至少八个字';const old={thesis:'条件判断',mechanism:'盈利传导',evidence:quote,counterpoint:'条件不成立',watch:'订单',horizon:'long'};
 assert.equal(validateJudgment(old,quote)?.direction,undefined);
 assert.equal(validateJudgment({...old,direction:'bullish'},quote)?.direction,undefined);
 assert.equal(validateJudgment({...old,direction:'bullish',asset:'测试行业',conditions:'订单兑现'},quote)?.direction,'bullish');
 assert.equal(validateJudgment({...old,evidence:'不存在的引用超过八个字'},quote),undefined);
});
test('重复采集只升级无摘要官方短正文，日期与笔记不丢失，已有摘要不重做',()=>{
 const row={publisher:'测试官方',author:'测试官方',title:'测试正文标题',url:'https://example.org/release',canonical_url:'https://example.org/release',source_tier:'official' as const,is_primary:true,raw_text:'测试正文标题',raw_html:null,published_at:'2026-09-24T00:00:00Z',fetched_at:'2026-09-25T00:00:00Z'};
 assert.equal(ingestArticles([row]),1);const a=db.prepare('SELECT * FROM articles WHERE url=?').get(row.url)!;db.prepare("INSERT INTO research_notes(article_id,note,saved,created_at,updated_at) VALUES(?,'私有笔记',1,'x','x')").run(a.id);
 const body='测试正文新增事实内容。'.repeat(30);assert.equal(ingestArticles([{...row,raw_text:body,fetched_at:new Date().toISOString()}]),0);
 const after=db.prepare('SELECT * FROM articles WHERE id=?').get(a.id)!;assert.equal(after.raw_text,body);assert.equal(after.fetched_at,row.fetched_at);assert.equal(after.published_at,row.published_at);assert.equal(db.prepare('SELECT note FROM research_notes WHERE article_id=?').get(a.id)?.note,'私有笔记');
 db.prepare("INSERT INTO summaries(article_id,summary) VALUES(?,'已生成摘要')").run(a.id);ingestArticles([{...row,raw_text:body+'另一版本'}]);assert.equal(db.prepare('SELECT raw_text FROM articles WHERE id=?').get(a.id)?.raw_text,body);
});
