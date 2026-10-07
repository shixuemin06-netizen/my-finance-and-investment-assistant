import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicEdition, type PublicInputArticle } from '../lib/public-edition';
import { applySourceCheck } from '../cloud-reader/scheduled-refresh';
const now = Date.parse('2026-10-07T06:00:00Z');
const body = '央行披露货币政策执行安排，资金投放与信贷需求需分别核对。政策工具改变银行融资条件，但企业贷款需求、实际资金用途与政策传导存在时间差。判断政策影响时，应持续观察利率、信贷数据与企业融资成本，不能将操作规模直接等同于经济增长。'.repeat(3);
const row = (id: number, extra: Partial<PublicInputArticle> = {}): PublicInputArticle => ({ id, title: '央行货币政策执行安排', url: 'https://www.example.org/policy/' + id, source_type: 'crawled', publisher: '人民银行', raw_text: body, source_tier: 'official', published_at: '2026-10-06T06:00:00Z', fetched_at: '2026-10-06T07:00:00Z', ...extra });
const sources = [{ id: 'source', name: '来源', url: 'https://www.example.org/', status: 'ok' as const, accepted: 1 }];
test('successful empty check records execution without advancing material dates', () => {
  const seed = buildPublicEdition([row(1)], []);
  const result = applySourceCheck(seed, { rows: [], sources }, now);
  assert.equal(result.receipt.checkedAt, new Date(now).toISOString());
  assert.equal(result.edition.contentUpdatedAt, seed.contentUpdatedAt);
  assert.equal(result.edition.snapshotAt, seed.snapshotAt);
});
test('repeated official material is idempotent and retains its shared identifiers', () => {
  const seed = buildPublicEdition([row(1)], []);
  const result = applySourceCheck(seed, { rows: [row(91, { url: row(1).url, fetched_at: new Date(now).toISOString() })], sources }, now);
  assert.equal(result.receipt.added, 0); assert.equal(result.receipt.revised, 0);
  assert.equal(result.edition.articles[0].id, 1);
  assert.equal(result.edition.contentUpdatedAt, seed.contentUpdatedAt);
});
test('hash collision for a different official URL cannot replace an old shared link', () => {
  const seed = buildPublicEdition([row(1)], []);
  const result = applySourceCheck(seed, { rows: [row(1, { url: 'https://www.example.org/policy/new', fetched_at: new Date(now).toISOString() })], sources }, now);
  assert.equal(result.receipt.added, 1);
  assert.equal(new Set(result.edition.articles.map(a => a.id)).size, 2);
  assert.equal(result.edition.articles.find(a => a.id === 1)?.url, row(1).url);
});
test('failed source check reports failure and preserves the public archive', () => {
  const seed = buildPublicEdition([row(1)], []);
  const result = applySourceCheck(seed, { rows: [], sources: [{ ...sources[0], status: 'failed', accepted: 0, error: 'HTTP 403' }] }, now);
  assert.equal(result.receipt.status, 'failed');
  assert.deepEqual(result.edition.articles, seed.articles);
});
test('source refresh cannot replace a reviewed summary solely due to extractor changes', () => {
  const seed = buildPublicEdition([row(1)], []);
  seed.articles[0].summary = '既有已审阅摘要';
  const result = applySourceCheck(seed, { rows: [row(1, { raw_text: body + '另有政策工具补充。' })], sources }, now);
  assert.equal(result.receipt.revised, 0);
  assert.deepEqual(result.edition.articles, seed.articles);
});
