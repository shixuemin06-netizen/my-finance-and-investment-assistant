import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.FINANCE_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'finance-stories-'));
delete process.env.DEEPSEEK_API_KEY;delete process.env.ZHIPU_API_KEY;
const {default:db}=await import('../lib/db');
const {syncStories,getStory,queryStories,updateStoryState}=await import('../lib/stories');
const {eventKey}=await import('../lib/story-classification');
const {updateDue,runSummaryBatches}=await import('../lib/scheduling');
const {POST}=await import('../app/api/stories/[id]/state/route');
function article(id:number,title:string,url='https://example.org/'+id){return {id,title,url,fetched_at:'2026-09-22T00:00:00.000Z'};}
test('明确同次会议可跨来源关联，不同会议、月份和不确定关联保持独立',()=>{
 assert.equal(eventKey(article(1,'美联储 2026-09-16 利率决议')),eventKey(article(2,'美联储 2026年9月16日 维持利率')));
 assert.notEqual(eventKey(article(1,'美联储 2026-09-16 利率决议')),eventKey(article(2,'美联储 2026-07-29 利率决议')));
 assert.notEqual(eventKey(article(1,'美国8月CPI')),eventKey(article(2,'美国9月CPI')));
 assert.notEqual(eventKey(article(1,'美联储降息')),eventKey(article(2,'美联储降息')));
});
test('加法迁移重复执行不破坏旧日报与文章笔记',()=>{
 db.prepare("INSERT INTO articles(id,title,url,raw_text,fetched_at) VALUES(1,'原始标题','https://example.org/1','原始材料','2026-09-21T01:00:00Z')").run();
 db.prepare("INSERT INTO research_notes(article_id,note,saved,created_at,updated_at) VALUES(1,'保留笔记',0,'x','x')").run();
 db.prepare("INSERT INTO digests(date,full_content_md,article_ids) VALUES('2026-09-21','冻结内容','[1]')").run();
 assert.equal(syncStories(),1);assert.equal(syncStories(),0);
 assert.equal(db.prepare('SELECT note FROM research_notes').get()?.note,'保留笔记');
 assert.equal(db.prepare('SELECT full_content_md FROM digests').get()?.full_content_md,'冻结内容');
 assert.equal(queryStories().total,1);assert.equal(queryStories({date:'2026-09-21'}).total,1);
});
test('关注进度只确认已看到版本；新摘要触发未读；取消收藏保留笔记',()=>{
 const id=queryStories().items[0].id;
 updateStoryState(id,'follow',true);updateStoryState(id,'save',true);updateStoryState(id,'note','继续核对原文');
 const old=getStory(id)!.revision;updateStoryState(id,'read',old);assert.equal(getStory(id)!.unread,0);
 db.prepare("INSERT INTO summaries(article_id,summary) VALUES(1,'新增解读')").run();syncStories();
 assert.equal(getStory(id)!.unread,1);updateStoryState(id,'read',old);assert.equal(getStory(id)!.unread,1);
 updateStoryState(id,'save',false);assert.equal(getStory(id)!.note,'继续核对原文');
 assert.equal(queryStories({state:'saved'}).total,0);assert.equal(queryStories({state:'notes'}).total,1);
 assert.equal(queryStories({state:'followed'}).total,1);
});
test('同次事件转载数量不升级为独立证据',()=>{
 for(const id of [2,3])db.prepare("INSERT INTO articles(id,title,url,publisher,source_tier,is_primary,fetched_at) VALUES(?,? ,?,'转载媒体','media',0,'2026-09-22T00:00:00Z')").run(id,'美联储 2026-09-16 利率决议','https://example.org/'+id);
 syncStories();const s=queryStories().items.find(s=>s.report_count===2)!;assert.ok(s);assert.equal(s.is_primary,0);assert.equal(s.source_tier,'media');
});
test('外站不可修改研究记录；无效进度拒绝',async()=>{
 const id=queryStories().items[0].id;
 const req=(origin:string,value:unknown)=>new Request('http://127.0.0.1:3099/api/stories/'+id+'/state',{method:'POST',headers:{host:'127.0.0.1:3099',origin,'content-type':'application/json'},body:JSON.stringify({action:'read',value})});
 assert.equal((await POST(req('https://foreign.example',1),{params:Promise.resolve({id})})).status,403);
 assert.equal((await POST(req('http://127.0.0.1:3099',-1),{params:Promise.resolve({id})})).status,400);
});
test('恢复仅触发一次到期更新，失败不会紧密重试；每次最多40篇',async()=>{
 const now=Date.parse('2026-09-22T03:00:00Z');
 assert.equal(updateDue(null,'2026-09-20T00:00:00Z',now),true);
 assert.equal(updateDue('2026-09-22T02:30:00Z',null,now),false);
 let calls=0;assert.equal(await runSummaryBatches(async()=>{calls++;return 5},()=>false),40);assert.equal(calls,8);
 calls=0;assert.equal(await runSummaryBatches(async()=>{calls++;return 2},()=>false),2);assert.equal(calls,1);
 assert.equal(await runSummaryBatches(async()=>{throw Error('should not call')},()=>true),0);
});

test('全球报道再多也不挤出中国宏观候选，首页至多五项',async()=>{
 const {overview}=await import('../lib/stories');const now=new Date().toISOString();
 for(let i=100;i<161;i++)db.prepare("INSERT INTO articles(id,title,url,publisher,source_tier,is_primary,fetched_at,published_at) VALUES(?,?,?,'ECB','official',1,?,?)").run(i,'ECB monetary policy release '+i,'https://example.org/world/'+i,now,now);
 db.prepare("INSERT INTO articles(id,title,url,publisher,source_tier,is_primary,fetched_at,published_at) VALUES(200,'公开市场业务公告','https://example.org/pboc','人民银行','official',1,?,?)").run(now,now);syncStories();
 const home=overview();assert.ok(home.selected.some(s=>s.region==='china'));assert.ok(home.selected.some(s=>s.region!=='china'));assert.ok(home.selected.length<=5);
});
test('进度输入重复或较旧不会回退已读版本',()=>{
 const s=queryStories().items[0];updateStoryState(s.id,'read',s.revision);updateStoryState(s.id,'read',0);assert.equal(getStory(s.id)!.last_read_update,s.revision);
});

test('来源失败隔离：一个来源失败不阻止后续来源',async()=>{
 const {crawlAllAdapters}=await import('../crawlers/adapters/registry');
 const r=await crawlAllAdapters([{id:'bad',name:'测试失败源',tier:'official',isPrimary:true,crawl:async()=>{throw Error('离线测试断网');}},{id:'good',name:'测试正常源',tier:'official',isPrimary:true,crawl:async()=>[]}]);
 assert.equal(r.sourceResults.length,2);assert.equal(r.sourceResults[0].ok,false);assert.equal(r.sourceResults[1].ok,true);
});
test('RSS/Atom 解析保留月份对应原始链接，拦截伪装为200的HTML错误页',async()=>{
 const {parseRSS}=await import('../lib/fetcher');
 const entries=parseRSS('<feed><entry><title>Employment release</title><link href="https://www.bls.gov/news.release/archives/empsit_09042026.htm"/><published>2026-09-04T07:51:08-04:00</published><content>Original excerpt</content></entry></feed>');
 assert.equal(entries[0].link,'https://www.bls.gov/news.release/archives/empsit_09042026.htm');assert.equal(entries[0].description,'Original excerpt');
 assert.throws(()=>parseRSS('<html><body>Access denied</body></html>'),/有效 RSS/);
});
test('限流立即停止跨批处理，保留已完成摘要和所有原文',async()=>{
 const {summarizeAll}=await import('../pipeline/summarize');const ids=Array.from({length:8},(_,i)=>500+i);
 for(const id of ids)db.prepare("INSERT INTO articles(id,title,url,raw_text,fetched_at) VALUES(?,?,?,? ,?)").run(id,'限流测试 '+id,'https://example.org/rate/'+id,'限流测试原文。'.repeat(30),new Date().toISOString());
 process.env.DEEPSEEK_API_KEY='test-only-no-network';process.env.LLM_REAL_CONTENT_ENABLED='1';let calls=0;
 try{const fake=async()=>{if(++calls===2)throw Object.assign(Error('test rate limit'),{status:429});return {summary:'已完成的测试摘要',tags:[],stance:'neutral' as const,confidence:.5};};
 const done=await runSummaryBatches(()=>summarizeAll(undefined,'fetched_at',5,ids,fake));assert.equal(done,1);assert.equal(calls,2);assert.equal(db.prepare('SELECT count(*) n FROM articles WHERE id>=500 AND id<508').get()?.n,8);
 }finally{delete process.env.DEEPSEEK_API_KEY;delete process.env.LLM_REAL_CONTENT_ENABLED;}
});
test('异常退出留下的任务在重启后可恢复，不需等三小时',async()=>{
 const {startJob,finishJob}=await import('../lib/jobs');db.prepare("INSERT INTO job_runs(started_at,status,owner_pid) VALUES(?,'running',2147483646)").run(new Date().toISOString());
 const id=startJob('manual');assert.ok(id);finishJob(id,{status:'success',sourceResults:[],stageTimings:{},newCount:0,skippedCount:0,failedCount:0});assert.equal(db.prepare("SELECT count(*) n FROM job_runs WHERE status='running'").get()?.n,0);
});
