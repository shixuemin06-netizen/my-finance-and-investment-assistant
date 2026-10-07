import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentFingerprint } from '../lib/content-fingerprint';

process.env.FINANCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-quality-pipeline-'));
process.env.LLM_PROVIDER = 'deepseek';
process.env.LLM_MODEL = 'deepseek-flash';
process.env.DEEPSEEK_API_KEY = 'offline-test-only';
process.env.LLM_REAL_CONTENT_ENABLED = '1';
const { default: db } = await import('../lib/db');
const { summarizeAll } = await import('../pipeline/summarize');
const { ingestArticles } = await import('../pipeline/ingest');

const title = '欧洲央行维持政策利率不变';
const body = title + '\n\n欧洲央行在本次货币政策会议后公布利率决议，管理委员会决定维持三项关键政策利率不变。委员会将继续依据通胀前景、经济数据和货币政策传导情况，逐次会议确定适当政策。\n\n欧洲央行指出，当前服务业价格和工资增长仍需观察，政策决定不会预先承诺利率路径。银行贷款调查和下一期通胀数据将为后续会议提供依据。\n\n欧洲央行本次会议没有宣布新的资产购买计划，也没有公布未来降息时间。读者应核对会议声明与后续数据，区分政策决定和市场猜测。';
const row = (suffix: string, text: string | null = body) => ({
  publisher: '欧洲央行', author: '欧洲央行', title, url: 'https://www.ecb.europa.eu/press/pr/' + suffix + '.html',
  canonical_url: 'https://www.ecb.europa.eu/press/pr/' + suffix + '.html', source_tier: 'official' as const, is_primary: true,
  raw_text: text, raw_html: null, published_at: '2026-09-24T12:00:00Z', fetched_at: '2026-09-25T00:00:00Z',
});
const summary = { summary: '欧洲央行维持三项关键政策利率不变，继续依据通胀与经济数据逐次会议决定政策，没有承诺未来降息时间。', tags: ['宏观政策'], stance: 'neutral' as const, confidence: 0.5 };
const judgment = { thesis: '融资成本的短期变化需等待新数据。', mechanism: '政策利率维持不变意味着本次会议没有新增宽松，但银行贷款条件仍可能变化。', evidence: '管理委员会决定维持三项关键政策利率不变。', counterpoint: '银行贷款条件提前变化会削弱利率稳定的短期影响。', watch: '银行贷款调查与下一期通胀数据。', horizon: 'short' as const };

test('标题-only、无正文材料不调用模型，后续有效材料可继续处理且判断引用可追溯', async () => {
  ingestArticles([row('no-body', null), row('title-only', title), row('substantive')]);
  const ids = db.prepare('SELECT id FROM articles').all().map(a => a.id);
  let calls = 0;
  assert.equal(await summarizeAll(undefined, 'fetched_at', 5, ids, async () => { calls++; return { ...summary, judgment }; }), 1);
  assert.equal(calls, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM article_judgments').get()?.n, 1);
  const a = db.prepare('SELECT * FROM articles WHERE url=?').get(row('substantive').url)!;
  assert.equal(db.prepare('SELECT source_fingerprint FROM generation_basis WHERE article_id=?').get(a.id)?.source_fingerprint, contentFingerprint(a as any));
  for (const invalid of ['no-body', 'title-only']) {
    const id = db.prepare('SELECT id FROM articles WHERE url=?').get(row(invalid).url)!.id;
    assert.equal(db.prepare('SELECT summary FROM summaries WHERE article_id=?').get(id), undefined);
    assert.equal(db.prepare('SELECT status FROM quality_review WHERE article_id=?').get(id)?.status, 'review');
  }
});

test('修复不合格正文会归档并作废旧摘要、判断、翻译，保留原日期及私人笔记', () => {
  const item = { ...row('corrected-extraction'), title: '欧洲央行本次会议维持政策利率不变', raw_text: '欧洲央行本次会议维持政策利率不变' };
  ingestArticles([item]);
  const a = db.prepare('SELECT * FROM articles WHERE url=?').get(item.url)!;
  db.prepare("INSERT INTO summaries(article_id,summary) VALUES(?,'错位的旧摘要')").run(a.id);
  db.prepare("INSERT INTO article_judgments(article_id,content,generated_at) VALUES(?,'旧判断','x')").run(a.id);
  db.prepare("INSERT INTO article_translations(article_id,title_zh,language,generated_at) VALUES(?,'旧翻译','en','x')").run(a.id);
  db.prepare("INSERT INTO research_notes(article_id,note,saved,created_at,updated_at) VALUES(?,'私人核对记录',1,'x','x')").run(a.id);
  assert.equal(ingestArticles([{ ...item, raw_text: body, fetched_at: '2026-09-26T00:00:00Z' }]), 0);
  const next = db.prepare('SELECT * FROM articles WHERE id=?').get(a.id)!;
  assert.equal(next.raw_text, body); assert.equal(next.fetched_at, item.fetched_at); assert.equal(next.published_at, item.published_at);
  assert.equal(db.prepare('SELECT summary FROM summaries WHERE article_id=?').get(a.id), undefined);
  assert.equal(db.prepare('SELECT content FROM article_judgments WHERE article_id=?').get(a.id), undefined);
  assert.equal(db.prepare('SELECT title_zh FROM article_translations WHERE article_id=?').get(a.id), undefined);
  assert.equal(db.prepare('SELECT note FROM research_notes WHERE article_id=?').get(a.id)?.note, '私人核对记录');
  const history = db.prepare('SELECT * FROM generation_history WHERE article_id=?').get(a.id)!;
  assert.equal(history.summary, '错位的旧摘要'); assert.equal(history.reason, 'extraction_corrected');
});

test('模型返回期间正文改变时，不保存基于旧正文的摘要或判断', async () => {
  const item = row('source-race', body + '\n该份资料用于竞态检查。');
  ingestArticles([item]);
  const id = db.prepare('SELECT id FROM articles WHERE url=?').get(item.url)!.id;
  assert.equal(await summarizeAll(undefined, 'fetched_at', 1, [id], async () => {
    db.prepare('UPDATE articles SET raw_text=? WHERE id=?').run(body + '\n新修订正文已生效。', id);
    return { ...summary, judgment };
  }), 0);
  assert.equal(db.prepare('SELECT summary FROM summaries WHERE article_id=?').get(id), undefined);
  assert.match(db.prepare('SELECT reasons FROM quality_review WHERE article_id=?').get(id)?.reasons, /generation_source_changed/);
});

test('重复有效正文不作付费重生成；不存在的引文不进入判断表', async () => {
  const item = row('invalid-quote', body + '\n单独核对引用。');
  ingestArticles([item]);
  const id = db.prepare('SELECT id FROM articles WHERE url=?').get(item.url)!.id;
  assert.equal(await summarizeAll(undefined, 'fetched_at', 1, [id], async () => ({ ...summary, judgment: { ...judgment, evidence: '一段不在所提供正文里的虚构引用。' } })), 1);
  assert.equal(db.prepare('SELECT content FROM article_judgments WHERE article_id=?').get(id), undefined);
  ingestArticles([{ ...item, raw_text: item.raw_text + '\n无需自动付费重做的正常重复采集。' }]);
  assert.equal(db.prepare('SELECT raw_text FROM articles WHERE id=?').get(id)?.raw_text, item.raw_text);
  let calls = 0;
  assert.equal(await summarizeAll(undefined, 'fetched_at', 1, [id], async () => { calls++; return summary; }), 0);
  assert.equal(calls, 0);
});

test('四十条待复核新材料不会阻断更早的有效材料生成', async () => {
  const valid = row('older-valid', body + '\n该记录验证摘要队列不被最新无正文材料堵塞。');
  ingestArticles([valid]);
  const ids = [db.prepare('SELECT id FROM articles WHERE url=?').get(valid.url)!.id];
  for (let i = 0; i < 45; i++) {
    const invalid = { ...row('queued-no-body-' + i, null), title: '待复核的无正文材料 ' + i };
    ingestArticles([invalid]);
    ids.push(db.prepare('SELECT id FROM articles WHERE url=?').get(invalid.url)!.id);
  }
  let calls = 0;
  assert.equal(await summarizeAll(undefined, 'fetched_at', 1, ids, async () => { calls++; return summary; }), 1);
  assert.equal(calls, 1);
  assert.equal(db.prepare('SELECT summary FROM summaries WHERE article_id=?').get(ids[0])?.summary, summary.summary);
});
