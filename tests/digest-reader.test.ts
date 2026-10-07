import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.FINANCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-digest-reader-'));
delete process.env.ZHIPU_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
const { default: db } = await import('../lib/db');
const { splitDigestMarkdown, digestReport } = await import('../components/DigestBody');

test('日报将已知材料章节放入附录，保留历史自定义正文与反向检验', () => {
  const frozen = '# 财经日报\n> **2026年9月26日** ｜ 冻结材料 2 篇，已生成摘要 1 条\n\n---\n## 本期主题\n- 政策\n\n---\n## 共识与分歧\n尚无跨来源共识。\n\n## 反向检验\n如果后续通胀回升，当前推论不成立。\n\n## 材料摘要\n### 来源甲\n原文摘要。\n\n## 待摘要原文\n尚未摘要。';
  const parts = splitDigestMarkdown(frozen);
  assert.match(parts.body, /共识与分歧/);
  assert.match(parts.body, /反向检验/);
  assert.doesNotMatch(parts.body, /冻结材料|材料摘要|本期主题/);
  assert.match(parts.references, /原文摘要/);
  assert.match(parts.references, /尚未摘要/);
  assert.match(parts.themes, /政策/);
  assert.equal(splitDigestMarkdown('## 自定义判断\n原有历史内容').body, '## 自定义判断\n原有历史内容');
});

test('本期判断限于冻结材料，拒绝伪造引用、损坏 JSON 与重复观点', () => {
  const quote = '此次措施仍需观察实际融资成本的变化';
  const judgment = { thesis: '融资成本改善须以信贷实际传导为条件', mechanism: '观察政策向企业融资传导', evidence: quote, counterpoint: '银行风险偏好下降可能抵消传导', watch: '企业贷款利率及融资需求', horizon: 'short' };
  for (const [id, raw, content] of [
    [1, quote, JSON.stringify(judgment)],
    [2, '原文没有这条引用', JSON.stringify(judgment)],
    [3, quote, '{broken'],
    [4, quote, JSON.stringify(judgment)],
    [5, quote, JSON.stringify({ ...judgment, thesis: '不属于本期的观点' })],
  ] as Array<[number, string, string]>) {
    db.prepare("INSERT INTO articles(id,title,url,raw_text,fetched_at,source_tier) VALUES(?,? ,? ,?,'2026-09-26T00:00:00Z','official')").run(id, '测试材料' + id, 'https://example.org/' + id, raw);
    db.prepare('INSERT INTO article_judgments(article_id,content,generated_at) VALUES(?,?,?)').run(id, content, '2026-09-26T01:00:00Z');
  }
  const digest = { id: 1, date: '2026-09-26', title: '测试日报', one_liner: null, full_content_md: '# 财经日报\n\n## 材料摘要\n冻结正文', article_count: 4, article_ids: '[1,2,3,4]', generated_at: '2026-09-26T01:00:00Z' };
  const report = digestReport(digest);
  assert.equal(report.materials.length, 4);
  assert.equal(report.theses.length, 1);
  assert.equal(report.theses[0].judgment.thesis, judgment.thesis);
  assert.ok([1, 4].includes(report.theses[0].material.id));
  assert.match(report.references, /冻结正文/);
  assert.deepEqual(digestReport({ ...digest, article_ids: 'malformed' }).theses, []);
});
