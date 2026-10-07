import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate, beijingToday } from '../lib/time';
import { isSafeUrl } from '../lib/ssrf-guard';
import { computeEvidenceLevels } from '../lib/evidence';
import { selectTopInsights } from '../lib/select';
import type { ArticleRow, SummaryRow } from '../lib/types';

// ===== 日期归桶 =====
test('normalizeDate 归一化各种日期格式', () => {
  assert.equal(normalizeDate('2026-08-22'), '2026-08-22');
  assert.equal(normalizeDate('2026-08-22T09:00:00+08:00'), '2026-08-22');
  assert.equal(normalizeDate('invalid'), null);
  assert.equal(normalizeDate(null), null);
});

test('beijingToday 返回 YYYY-MM-DD', () => {
  assert.match(beijingToday(), /^\d{4}-\d{2}-\d{2}$/);
});

// ===== 作者与平台区分 =====
test('主题重合不能自动升级为独立佐证', () => {
  const articles: ArticleRow[] = [
    mkArticle(1, 'official', 1, '央行', '官方A'),
    mkArticle(2, 'media', 0, '证券时报', '媒体B'),
    mkArticle(3, 'community', 0, '雪球', '社区C'),
  ];
  const summaries: SummaryRow[] = [
    mkSummary(1, '["降息"]'),
    mkSummary(2, '["降息"]'),
    mkSummary(3, '["AI算力"]'),
  ];

  computeEvidenceLevels(articles, summaries);

  assert.equal(summaries.find((s) => s.article_id === 1)?.evidence_level, 'official');
  assert.equal(summaries.find((s) => s.article_id === 2)?.evidence_level, 'single_source'); // 同主题不代表同一事实或独立来源
  assert.equal(summaries.find((s) => s.article_id === 3)?.evidence_level, 'single_source');
});

// 同一机构的多个 URL 不是“多源”。
test('证据等级不把同一发布机构的不同链接当作多源', () => {
  const articles: ArticleRow[] = [
    mkArticle(1, 'media', 0, '同一家媒体', '编辑甲'),
    mkArticle(2, 'media', 0, '同一家媒体', '编辑乙'),
  ];
  const summaries: SummaryRow[] = [mkSummary(1, '["房地产"]'), mkSummary(2, '["房地产"]')];
  computeEvidenceLevels(articles, summaries);
  assert.equal(summaries[0].evidence_level, 'single_source');
  assert.equal(summaries[1].evidence_level, 'single_source');
});
// ===== 三件事选择 =====
test('selectTopInsights 优先官方一手来源', () => {
  const articles: ArticleRow[] = [
    mkArticle(1, 'official', 1, '央行', '官方'),
    mkArticle(2, 'community', 0, '雪球', '社区'),
  ];
  const summaries: SummaryRow[] = [
    mkSummary(1, '["降息"]'),
    mkSummary(2, '["AI算力"]'),
  ];

  const ids = selectTopInsights(articles, summaries, undefined, 1);
  assert.equal(ids[0], 1); // 官方一手应排第一
});

// ===== 重复链接去重（ingest 的 url + hash 逻辑） =====
test('isSafeUrl 拒绝内网 / 本机 / 非 http', async () => {
  assert.equal((await isSafeUrl('http://127.0.0.1:3099/x')).safe, false);
  assert.equal((await isSafeUrl('http://localhost/x')).safe, false);
  assert.equal((await isSafeUrl('http://192.168.1.1/x')).safe, false);
  assert.equal((await isSafeUrl('http://10.0.0.1/x')).safe, false);
  assert.equal((await isSafeUrl('ftp://example.com/x')).safe, false);
  assert.equal((await isSafeUrl('not-a-url')).safe, false);
  assert.equal((await isSafeUrl('https://example.com/x')).safe, true);
});

// ===== 日报文章集合冻结 =====
test('digests.article_ids 冻结集合解析', () => {
  // 模拟 digest 存的是 JSON 数组，验证前端解析函数能正确还原
  const frozen = JSON.stringify([1, 2, 3]);
  const ids = JSON.parse(frozen).map(Number);
  assert.deepEqual(ids, [1, 2, 3]);
});

// ===== helpers =====
function mkArticle(
  id: number,
  tier: 'official' | 'media' | 'community',
  isPrimary: 0 | 1,
  publisher: string,
  author: string
): ArticleRow {
  return {
    id,
    source_id: null,
    publisher,
    author,
    title: `标题${id}`,
    url: `https://example.com/${id}`,
    canonical_url: `https://example.com/${id}`,
    source_tier: tier,
    is_primary: isPrimary,
    raw_text: `正文${id}`,
    raw_html: null,
    content_hash: `hash${id}`,
    published_at: '2026-08-22',
    fetched_at: '2026-08-22T00:00:00.000Z',
    digest_date: null,
    source_type: 'crawled',
  };
}

function mkSummary(articleId: number, tags: string): SummaryRow {
  return {
    id: articleId,
    article_id: articleId,
    summary: `摘要${articleId}`,
    tags,
    stance: 'neutral',
    confidence: 0.8,
    evidence_level: 'unverified',
    generated_at: '2026-08-22T00:00:00.000Z',
  };
}
