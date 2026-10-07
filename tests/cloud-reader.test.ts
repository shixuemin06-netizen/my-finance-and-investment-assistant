import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildPublicEdition, type PublicInputArticle, type PublicEdition } from '../lib/public-edition';
import { acquireLease, releaseLease, state, loadMaterials, mergeEdition, publicSearchData, type CloudDatabase, type Statement, type StoredMaterial } from '../cloud-reader/store';
import { handleRequest, refreshIfDue, type Environment } from '../cloud-reader/worker';

/** Execute the actual D1 SQL against SQLite, including a transactional batch. */
class SqliteStatement implements Statement {
  constructor(private database: DatabaseSync, private sql: string, private values: unknown[] = []) {}
  bind(...values: unknown[]): Statement { return new SqliteStatement(this.database, this.sql, values); }
  async first<T>(): Promise<T | null> { return this.database.prepare(this.sql).get(...this.values as any[]) as T || null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.database.prepare(this.sql).all(...this.values as any[]) as T[] }; }
  async run(): Promise<{ meta: { changes: number } }> { const result = this.database.prepare(this.sql).run(...this.values as any[]); return { meta: { changes: Number(result.changes) } }; }
}
class SqliteCloudDatabase implements CloudDatabase {
  readonly database = new DatabaseSync(':memory:');
  constructor() { this.database.exec('CREATE TABLE cloud_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE cloud_materials(url TEXT PRIMARY KEY,article_id INTEGER NOT NULL UNIQUE,published_at TEXT,payload TEXT NOT NULL);'); }
  prepare(sql: string) { return new SqliteStatement(this.database, sql); }
  async batch(statements: Statement[]) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); this.database.exec('COMMIT'); return result; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  close() { this.database.close(); }
}
const now = Date.parse('2026-10-04T00:00:00Z');
const body = '央行披露货币政策执行安排，资金投放与信贷需求需分别核对。政策工具改变银行融资条件，但企业贷款需求、实际资金用途与政策传导存在时间差。判断政策影响时，应持续观察利率、信贷数据与企业融资成本，不能将操作规模直接等同于经济增长。'.repeat(3);
const judgment = { thesis: '若信贷需求恢复，政策可能改善企业融资条件。', mechanism: '政策工具影响银行资金成本，再传导至融资条件。', evidence: '央行披露货币政策执行安排，资金投放与信贷需求需分别核对。', conditions: '信贷需求恢复且银行下调融资价格。', counterpoint: '需求偏弱可能使传导停留在银行端。', watch: '观察新增信贷与实际贷款价格。', horizon: 'short', direction: 'neutral', asset: '企业融资' };
function row(id: number, extra: Partial<PublicInputArticle> = {}): PublicInputArticle {
  return { id, title: '央行货币政策执行安排', url: 'https://www.example.org/policy/' + id, source_type: 'crawled', publisher: '人民银行', raw_text: body, source_tier: 'official', published_at: '2026-10-03T06:00:00Z', fetched_at: new Date(now - 3600000).toISOString(), ...extra };
}
function seed(): PublicEdition {
  return buildPublicEdition([row(1, { judgment: JSON.stringify(judgment), fetched_at: '2026-09-30T16:40:46Z', published_at: '2026-09-30' })], [{ date: '2026-09-30', article_ids: '[1]', generated_at: '2026-09-30T17:00:00Z' }], '2026-10-04T00:00:00Z');
}
function environment(database: CloudDatabase, baseline = seed()): Environment {
  return { DB: database, ASSETS: { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    return pathname === '/assets/edition-seed.json' ? Response.json(baseline) : new Response('<!doctype html><h1>STATIC_FALLBACK</h1>', { headers: { 'Content-Type': 'text/html' } });
  } } };
}
function fixtureFetcher(rows: PublicInputArticle[]) {
  return async () => ({ rows, sources: [{ id: 'fixture', name: '固定测试来源', url: 'https://www.example.org/feed', status: 'ok' as const, accepted: rows.length }] });
}

test('真实 SQLite lease SQL 只允许一个刷新拥有者，错误拥有者不能释放，过期后可重新认领', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const results = await Promise.all([acquireLease(database, now, 'owner-a'), acquireLease(database, now, 'owner-b')]);
    assert.equal(results.filter(Boolean).length, 1);
    const owner = results[0] ? 'owner-a' : 'owner-b';
    await releaseLease(database, 'unrelated-owner');
    assert.equal(await acquireLease(database, now + 1, 'owner-c'), false);
    assert.equal(await acquireLease(database, now + 90001, 'owner-c'), true);
    await releaseLease(database, owner);
    assert.equal(await acquireLease(database, now + 90002, 'owner-d'), false);
    await releaseLease(database, 'owner-c');
    assert.equal(await acquireLease(database, now + 90003, 'owner-d'), true);
  } finally { database.close(); }
});

test('并发刷新只抓取一次；小时内读取复用回执，重复抓取不推进资料时间和快照日期', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = seed(), env = environment(database, baseline); let calls = 0;
    const fetcher = async () => { calls++; return fixtureFetcher([row(2)])(); };
    const first = await Promise.all([refreshIfDue(env, baseline, now, fetcher), refreshIfDue(env, baseline, now, fetcher)]);
    assert.equal(calls, 1);
    assert.equal(first.filter(receipt => receipt?.added === 1).length >= 1, true);
    const stored = await loadMaterials(database), edition = mergeEdition(baseline, stored, new Date(now).toISOString());
    const inHour = await refreshIfDue(env, baseline, now + 1000, fetcher);
    assert.equal(inHour?.added, 1); assert.equal(calls, 1);
    const unchangedFetcher = async () => { calls++; return fixtureFetcher([row(2, { fetched_at: new Date(now + 3700000).toISOString() })])(); };
    const second = await refreshIfDue(env, baseline, now + 3700000, unchangedFetcher);
    assert.equal(second?.added, 0); assert.equal(second?.revised, 0); assert.equal(calls, 2);
    assert.equal(await state(database, 'refresh-lock').catch(() => 'invalid'), null);
    const unchanged = mergeEdition(baseline, await loadMaterials(database), new Date(now + 3700000).toISOString());
    assert.equal(unchanged.contentUpdatedAt, edition.contentUpdatedAt);
    assert.equal(unchanged.snapshotAt, edition.snapshotAt);
  } finally { database.close(); }
});

test('已公开历史 URL 保留既有材料 ID、事件与经过核对的判断，不被轮询副本替换', () => {
  const baseline = seed();
  const duplicate = buildPublicEdition([row(100, { url: baseline.articles[0].url })], [], new Date(now + 1000).toISOString());
  const item: StoredMaterial = { article: duplicate.articles[0], event: duplicate.events[0] };
  const merged = mergeEdition(baseline, [item], new Date(now + 1000).toISOString());
  assert.equal(merged.articles.length, 1);
  assert.equal(merged.articles[0].id, 1);
  assert.deepEqual(merged.articles[0].judgment, baseline.articles[0].judgment);
  assert.deepEqual(merged.events, baseline.events);
  assert.deepEqual(merged.issues, baseline.issues);
  assert.equal(merged.snapshotAt, baseline.snapshotAt);
});

test('云材料修订即使上游候选 ID 改变，也保留已分享 URL 的历史 ID 和事件关联', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = seed(), env = environment(database, baseline), original = row(2);
    await refreshIfDue(env, baseline, now, fixtureFetcher([original]));
    const revised = { ...row(200, { url: original.url }), raw_text: body + '\n货币政策执行安排补充：后续公布实际贷款价格与资金用途。', fetched_at: new Date(now + 3700000).toISOString() };
    const receipt = await refreshIfDue(env, baseline, now + 3700000, fixtureFetcher([revised]));
    assert.equal(receipt?.revised, 1);
    const material = (await loadMaterials(database))[0];
    assert.equal(material.article.id, 2);
    assert.equal(material.event.representativeArticleId, 2);
    assert.deepEqual(material.event.articleIds, [2]);
    const storedId = database.database.prepare('SELECT article_id FROM cloud_materials WHERE url=?').get(original.url);
    assert.equal(storedId?.article_id, material.article.id);
    const merged = mergeEdition(baseline, [material]);
    assert.ok(merged.articles.find(article => article.id === 2));
    assert.equal(merged.contentUpdatedAt, revised.fetched_at);
  } finally { database.close(); }
});

test('同原文只修复标题式旧摘录时保留收录与快照时间，不冒充新增资讯', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = { ...seed(), snapshotAt: '2026-09-30T17:00:00Z' }, original = row(2);
    const approved = buildPublicEdition([original], [], baseline.snapshotAt);
    const legacy: StoredMaterial = { article: { ...approved.articles[0], factExcerpt: approved.articles[0].title }, event: approved.events[0] };
    await database.prepare('INSERT INTO cloud_materials(url,article_id,published_at,payload) VALUES(?,?,?,?)')
      .bind(legacy.article.url, legacy.article.id, legacy.article.publishedAt, JSON.stringify(legacy)).run();
    const before = mergeEdition(baseline, await loadMaterials(database));
    assert.equal(before.snapshotAt, original.fetched_at);
    const checkedAt = now + 3700000;
    const collected = { ...original, fetched_at: new Date(checkedAt).toISOString() };
    const candidate = buildPublicEdition([collected], [], new Date(checkedAt).toISOString()).articles[0];
    assert.equal(candidate.basisFingerprint, legacy.article.basisFingerprint);
    assert.notEqual(candidate.factExcerpt, candidate.title);
    const env = environment(database, baseline), receipt = await refreshIfDue(env, baseline, checkedAt, fixtureFetcher([collected]));
    assert.equal(receipt?.added, 0);
    assert.equal(receipt?.revised, 1);
    assert.equal(receipt?.checkedAt, new Date(checkedAt).toISOString());
    const repaired = (await loadMaterials(database))[0];
    assert.equal(repaired.article.id, legacy.article.id);
    assert.equal(repaired.event.id, legacy.event.id);
    assert.equal(repaired.article.basisFingerprint, legacy.article.basisFingerprint);
    assert.equal(repaired.article.factExcerpt, candidate.factExcerpt);
    assert.ok(repaired.article.factExcerpt.includes('资金投放与信贷需求需分别核对'));
    assert.equal(repaired.article.fetchedAt, legacy.article.fetchedAt);
    const after = mergeEdition(baseline, [repaired]);
    assert.equal(after.contentUpdatedAt, before.contentUpdatedAt);
    assert.equal(after.snapshotAt, before.snapshotAt);
    assert.deepEqual(after.issues, before.issues);
    const nextCheckedAt = checkedAt + 3700000;
    const repeat = await refreshIfDue(env, baseline, nextCheckedAt, fixtureFetcher([{ ...original, fetched_at: new Date(nextCheckedAt).toISOString() }]));
    assert.equal(repeat?.added, 0); assert.equal(repeat?.revised, 0);
    const repeated = mergeEdition(baseline, await loadMaterials(database));
    assert.equal(repeated.contentUpdatedAt, before.contentUpdatedAt);
    assert.equal(repeated.snapshotAt, before.snapshotAt);
  } finally { database.close(); }
});

test('超过3000条云材料后历史材料仍可加载，不丢弃既有分享链接', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = seed(), article = baseline.articles[0], event = baseline.events[0];
    const insert = database.database.prepare('INSERT INTO cloud_materials(url,article_id,published_at,payload) VALUES(?,?,?,?)');
    database.database.exec('BEGIN');
    for (let index = 0; index < 3001; index++) {
      const id = index + 1000, publishedAt = new Date(now - (4000 - index) * 3600000).toISOString();
      const material: StoredMaterial = { article: { ...article, id, url: 'https://www.example.org/archive/' + id, publishedAt, eventId: 'archive-' + id }, event: { ...event, id: 'archive-' + id, articleIds: [id], representativeArticleId: id, firstAt: publishedAt, latestAt: publishedAt } };
      insert.run(material.article.url, id, publishedAt, JSON.stringify(material));
    }
    database.database.exec('COMMIT');
    const loaded = await loadMaterials(database);
    assert.equal(loaded.length, 3001);
    assert.ok(loaded.find(material => material.article.id === 1000));
    const page = await handleRequest(new Request('https://example.org/articles/1000/'), environment(database));
    assert.equal(page.status, 200);
    assert.ok(!(await page.text()).includes('STATIC_FALLBACK'));
  } finally { database.close(); }
});

test('公开 projection 与云持久化均不包含完整原文、密钥、笔记和手动导入材料', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = seed(), env = environment(database, baseline);
    const source = { ...row(2), raw_text: body + '\n源正文私有标记RAW_BODY_ONLY，不能把完整正文写入公开JSON。', api_key: 'PRIVATE_SECRET_ONLY', private_note: 'PRIVATE_NOTE_ONLY' };
    const privateImport = row(3, { source_type: 'manual', raw_text: body + '\nMANUAL_NOTE_ONLY' });
    await refreshIfDue(env, baseline, now, fixtureFetcher([source, privateImport]));
    const stored = await loadMaterials(database);
    assert.equal(stored.length, 1);
    const persisted = database.database.prepare('SELECT payload FROM cloud_materials').get()?.payload as string;
    assert.ok(!persisted.includes('raw_text'));
    assert.ok(!persisted.includes('PRIVATE_SECRET_ONLY'));
    assert.ok(!persisted.includes('PRIVATE_NOTE_ONLY'));
    assert.ok(!persisted.includes('MANUAL_NOTE_ONLY'));
    assert.ok(!persisted.includes(body));
    const data = publicSearchData(mergeEdition(baseline, stored), null);
    const text = JSON.stringify(data);
    assert.ok(!text.includes('raw_text')); assert.ok(!text.includes('PRIVATE_SECRET_ONLY')); assert.ok(!text.includes('PRIVATE_NOTE_ONLY'));
    assert.equal(data.articles.length, 2);
  } finally { database.close(); }
});

test('存储或解析故障保留已发布页面；更新 API 返回明确失败，不泄漏底层错误', async () => {
  const broken: CloudDatabase = { prepare() { throw new Error('INTERNAL_SECRET_ONLY'); }, async batch() { throw new Error('INTERNAL_SECRET_ONLY'); } };
  const env = environment(broken);
  const response = await handleRequest(new Request('https://example.org/'), env);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('STATIC_FALLBACK'));
  const api = await handleRequest(new Request('https://example.org/api/status'), env);
  assert.equal(api.status, 503);
  assert.ok(!(await api.text()).includes('INTERNAL_SECRET_ONLY'));
});

test('云写入批次失败整体回滚，既有材料与成功回执保持可读', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const baseline = seed(), env = environment(database, baseline);
    await refreshIfDue(env, baseline, now, fixtureFetcher([row(2)]));
    const before = await state(database, 'last-refresh');
    // A conflicting existing ID makes the second statement fail after the first has run.
    await assert.rejects(() => refreshIfDue(env, baseline, now + 3700000, fixtureFetcher([row(3), row(2, { url: 'https://www.example.org/a-different-url' })])));
    assert.deepEqual((await loadMaterials(database)).map(material => material.article.id), [2]);
    assert.deepEqual(await state(database, 'last-refresh'), before);
    assert.equal(await state(database, 'refresh-lock'), null);
    const page = await handleRequest(new Request('https://example.org/articles/2/'), env);
    assert.equal(page.status, 200); assert.ok((await page.text()).includes('央行货币政策执行安排'));
  } finally { database.close(); }
});

test('损坏的云公开负载不会破坏已发布页面，API 不返回解析细节', async () => {
  const database = new SqliteCloudDatabase();
  try {
    await database.prepare('INSERT INTO cloud_materials(url,article_id,published_at,payload) VALUES(?,?,?,?)').bind('https://www.example.org/broken', 99, '2026-10-03', 'BROKEN_PRIVATE_DATA_ONLY').run();
    const env = environment(database), page = await handleRequest(new Request('https://example.org/'), env);
    assert.equal(page.status, 200); assert.ok((await page.text()).includes('STATIC_FALLBACK'));
    const api = await handleRequest(new Request('https://example.org/api/status'), env);
    assert.equal(api.status, 503); assert.ok(!(await api.text()).includes('BROKEN_PRIVATE_DATA_ONLY'));
  } finally { database.close(); }
});

test('公开 worker 拒绝写请求并隐藏种子资产；正常页面保持已有材料 URL 可读', async () => {
  const database = new SqliteCloudDatabase();
  try {
    const env = environment(database);
    const denied = await handleRequest(new Request('https://example.org/api/edition?url=https://private.local/', { method: 'POST', body: 'private_note=secret' }), env);
    assert.equal(denied.status, 405);
    assert.equal((await loadMaterials(database)).length, 0);
    const seedAsset = await handleRequest(new Request('https://example.org/assets/edition-seed.json'), env);
    assert.equal(seedAsset.status, 404);
    const article = await handleRequest(new Request('https://example.org/articles/1/'), env);
    assert.equal(article.status, 200);
    assert.ok((await article.text()).includes('央行货币政策执行安排'));
    const cache = await handleRequest(new Request('https://example.org/assets/public-data.json'), env);
    assert.equal(cache.status, 200);
    const payload = await cache.json() as { articles: { id: number }[] };
    assert.deepEqual(payload.articles.map(article => article.id), [1]);
  } finally { database.close(); }
});
