import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingFreshness } from '../lib/reading-freshness';
import { readResearchJudgment } from '../lib/research-judgment';
import { contentFingerprint } from '../lib/content-fingerprint';
import { sourceExcerpt } from '../lib/content-quality';

const now = Date.parse('2026-10-04T00:00:00Z');
test('时效以最近收录为准，重打包日期不会刷新资讯年龄', () => {
  assert.equal(readingFreshness('2026-09-30T16:00:00Z', now).state, 'stale');
  assert.equal(readingFreshness('2026-09-30T16:00:00Z', now).ageHours, 80);
  assert.equal(readingFreshness('2026-10-03T12:00:00Z', now).state, 'recent');
  for (const at of [null, 'invalid', '2026-10-05T00:00:00Z']) assert.equal(readingFreshness(at, now).state, 'unknown');
});

const body = '央行披露货币政策执行安排，资金投放与信贷需求需分别核对。政策工具改变银行融资条件，但企业贷款需求、实际资金用途与政策传导存在时间差。判断政策影响时，应持续观察利率、信贷数据与企业融资成本，不能将操作规模直接等同于经济增长。'.repeat(3);
const judgment = { thesis: '若信贷需求恢复，政策可能改善企业融资条件。', mechanism: '政策工具影响银行资金成本，再传导至融资条件。', evidence: '央行披露货币政策执行安排，资金投放与信贷需求需分别核对。', conditions: '信贷需求恢复且银行下调融资价格。', counterpoint: '需求偏弱可能使传导停留在银行端。', watch: '观察新增信贷与实际贷款价格。', horizon: 'short', direction: 'neutral', asset: '企业融资' };
const input = { title: '央行货币政策执行安排', url: 'https://example.org/policy', raw_text: body, judgment: JSON.stringify(judgment) };
test('首页判断同时校验实质正文、原文引用与明确条件', () => {
  assert.ok(readResearchJudgment(input, true));
  assert.equal(readResearchJudgment({ ...input, raw_text: judgment.evidence }, true), null);
  assert.equal(readResearchJudgment({ ...input, judgment: JSON.stringify({ ...judgment, conditions: undefined }) }, true), null);
  assert.equal(readResearchJudgment({ ...input, judgment: JSON.stringify({ ...judgment, horizon: 'knowledge' }) }, true), null);
});
test('原文变化后，仍能匹配某段引用的旧判断也必须隔离', () => {
  const source_fingerprint = contentFingerprint(input);
  assert.ok(readResearchJudgment({ ...input, source_fingerprint }, true));
  assert.equal(readResearchJudgment({ ...input, source_fingerprint, raw_text: body + '\n执行范围发生了后续调整。' }, true), null);
});
test('统计发布的摘录保留完整叙述，不将表格尾数带入下一段', () => {
  const prose = '9月份，非制造业商务活动指数为50.2%，比上月上升1.2个百分点，非制造业景气水平明显回升。';
  const excerpt = sourceExcerpt({ title: '中国非制造业采购经理指数运行情况', url: 'https://example.org/pmi', raw_text: '53.8\u2002\u3000\u3000二、中国非制造业采购经理指数运行情况\u2002\u3000\u3000' + prose });
  assert.equal(excerpt, prose);
});
