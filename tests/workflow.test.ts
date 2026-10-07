import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.FINANCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-workflow-'));
delete process.env.DEEPSEEK_API_KEY;
const { default: db } = await import('../lib/db');
const { generateDigest } = await import('../pipeline/generate');
const { summarizeAll } = await import('../pipeline/summarize');
const { getSourcePulse, getBriefItems } = await import('../lib/research');
const { startJob, finishJob } = await import('../lib/jobs');
const { POST: saveNote } = await import('../app/api/notes/route');
const { deliveryState } = await import('../lib/delivery');
const { beijingDateSql } = await import('../lib/time');
const { getLibrary } = await import('../lib/library');
for (let id = 1; id <= 7; id++) db.prepare("INSERT INTO articles(id,title,url,publisher,source_tier,is_primary,raw_text,published_at,fetched_at) VALUES(?,?,?,'测试机构','media',0,?,?,?)")
  .run(id,'测试材料 ' + id,'https://example.org/article/' + id,'用于验证摘要限额和原文保存。'.repeat(20),'2026-09-12','2026-09-11T17:00:00.000Z');

test('UTC 深夜入库归入北京时间次日；无摘要不能显示就绪', () => {
  assert.match(beijingDateSql('a.fetched_at'), /a.fetched_at/);
  generateDigest('2026-09-12');
  const pulse = getSourcePulse('2026-09-12');
  assert.equal(pulse.articleCount, 7); assert.equal(pulse.summaryCount, 0);
  assert.equal(pulse.pendingSummaryCount, 7); assert.equal(pulse.contentState, 'pending');
  const content = db.prepare("SELECT full_content_md FROM digests WHERE date='2026-09-12'").get()?.full_content_md;
  assert.match(content, /待摘要原文/); assert.match(content, /https:\/\/example.org\/article\/7/);
});

test('过去已完成的一期仍标记过期，不冒充今日内容', () => {
  const state = deliveryState('2026-09-03',12,12,3,'2026-09-12');
  assert.equal(state.stale, true); assert.equal(state.contentState, 'ready');
});

test('无密钥时不调用模型且保留所有待处理材料', async () => {
  assert.equal(await summarizeAll('2026-09-12'),0);
  assert.equal(db.prepare('SELECT count(*) n FROM summaries').get()?.n,0);
});

test('摘要最多五次请求；失败不入库；历史集合不丢失', async () => {
  let calls = 0;
  process.env.DEEPSEEK_API_KEY = 'test-only-no-network';process.env.LLM_REAL_CONTENT_ENABLED='1';
  try {
    const fake = async () => { calls++; return {titleZh:'重复的中文标题',summary:'测试生成摘要',tags:['测试主题'],stance:'neutral' as const,confidence:.8}; };
    assert.equal(await summarizeAll('2026-09-12','fetched_at',99,[1,2,3,4,5,6,7],fake),5);
    assert.equal(calls,5);
    assert.equal(db.prepare('SELECT count(*) n FROM article_translations').get()?.n,0);
    generateDigest('2026-09-12','fetched_at',[1,2,3,4,5,6,7]);
    assert.equal(getSourcePulse('2026-09-12').pendingSummaryCount,2);
    assert.equal(getSourcePulse('2026-09-12').contentState,'partial');
    assert.equal(getBriefItems('2026-09-12').length,3);
    calls = 0;
    const denied = async () => { calls++; throw Object.assign(new Error('Invalid test key'), {status:401}); };
    assert.equal(await summarizeAll('2026-09-12','fetched_at',5,undefined,denied),0);
    assert.equal(calls,1); assert.equal(db.prepare('SELECT count(*) n FROM summaries').get()?.n,5);
  } finally { delete process.env.DEEPSEEK_API_KEY;delete process.env.LLM_REAL_CONTENT_ENABLED; }
});

function request(origin: string, body: unknown) {
  return new Request('http://127.0.0.1:3099/api/notes',{method:'POST',headers:{host:'127.0.0.1:3099',origin,'content-type':'application/json'},body:JSON.stringify(body)});
}
test('笔记本地持久化、可检索；取消收藏保留笔记；拒绝外站写入',async () => {
  const body={articleId:1,note:'长期研究：成本下降还需财报验证。',horizon:'long',saved:true};
  assert.equal((await saveNote(request('https://foreign.example',body))).status,403);
  assert.equal((await saveNote(request('http://127.0.0.1:3099',body))).status,200);
  assert.equal(getLibrary({q:'成本下降'},true).total,1);
  assert.equal((await saveNote(request('http://127.0.0.1:3099',{...body,saved:false}))).status,200);
  assert.equal(getLibrary({},true).total,0);
  assert.equal(db.prepare('SELECT note FROM research_notes WHERE article_id=1').get()?.note,body.note);
});

test('运行锁阻止重复任务，完成后允许下一次操作', () => {
  const id=startJob('manual'); assert.throws(()=>startJob('manual'),/运行中/);
  finishJob(id,{status:'partial',sourceResults:[],stageTimings:{},newCount:0,skippedCount:0,failedCount:0});
  assert.ok(startJob('manual')>id);
});
