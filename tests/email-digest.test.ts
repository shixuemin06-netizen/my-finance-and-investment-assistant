import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDigestEmail, gmailDigestReceiptQuery, emailBusinessDate, normalizeEmailRecipient, validBusinessDate, type EmailFeed } from '../lib/digest-email';
import { EmailOutbox } from '../lib/email-outbox';

const now = new Date('2026-10-04T00:00:00Z');
const options = { businessDate: '2026-10-04', siteUrl: 'https://example.com/', now };
function feed(extra: Partial<EmailFeed> = {}): EmailFeed {
  return { contentUpdatedAt: '2026-10-03T23:20:00Z', articles: [{ id: 1, title: '央行发布货币政策报告', publisher: '测试官方', summary: '政策传导仍需进一步观察。', publishedAt: '2026-10-03T11:00:00Z', url: 'https://official.example/report', eventId: 'same-event' }], ...extra };
}
test('邮件保持公开来源日期，区分来源摘录和模型摘要，不插入未验证判断', () => {
  const email = renderDigestEmail(feed({ articles: [{ ...feed().articles[0], summaryKind: 'source_excerpt', judgment: { thesis: '无条件上涨', counterpoint: '观察风险', watch: '观察政策' } }] }), options);
  assert.equal(email.state, 'current');
  assert.ok(email.text.includes('2026-10-03'));
  assert.ok(email.text.includes('来源摘录：'));
  assert.ok(!email.text.includes('无条件上涨'));
  assert.ok(email.text.includes('https://official.example/report'));
});
test('历史或空快照仍报告更新状态，不冒充当天新闻', () => {
  const historic = renderDigestEmail(feed({ contentUpdatedAt: '2026-09-30T12:00:00Z', articles: [{ ...feed().articles[0], publishedAt: '2026-09-30' }] }), options);
  assert.equal(historic.state, 'historical');
  assert.ok(historic.text.includes('没有把它们当作今天的新消息'));
  assert.equal(historic.subject, '财经阅读日报｜2026-10-04');
  const empty = renderDigestEmail(feed({ articles: [] }), options);
  assert.equal(empty.state, 'empty');
  assert.ok(empty.text.includes('暂无可发送的公开材料'));
});
test('同事件只出一条，未来发布日期不发布，HTML和危险链接不执行', () => {
  const article = feed().articles[0];
  const email = renderDigestEmail(feed({ articles: [article, { ...article, id: 2 }, { ...article, id: 3, publishedAt: '2026-10-05', eventId: 'future' }, { ...article, id: 4, eventId: 'unsafe', title: '<script>alert(1)</script>', url: 'https://official.example/?token=SECRET' }] }), options);
  assert.equal(email.articleIds.length, 2);
  assert.ok(!email.articleIds.includes(3));
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(!email.text.includes('SECRET'));
});
test('只有有条件、反证和后续指标的公开判断才能进入邮件', () => {
  const email = renderDigestEmail(feed({ articles: [{ ...feed().articles[0], judgment: { thesis: '传导可能改善', conditions: '融资需求恢复', counterpoint: '终端需求仍偏弱', watch: '后续信贷数据' } }] }), options);
  assert.ok(email.text.includes('成立条件：融资需求恢复'));
  assert.ok(email.text.includes('反向检验：终端需求仍偏弱'));
  assert.ok(email.text.includes('继续跟踪：后续信贷数据'));
});
test('业务日期使用北京时间；收件人和搜索参数拒绝头注入及无效日期', () => {
  assert.equal(emailBusinessDate(new Date('2026-10-03T16:00:00Z')), '2026-10-04');
  assert.equal(validBusinessDate('2026-02-30'), false);
  assert.throws(() => normalizeEmailRecipient('a@example.com\r\nBcc:x@example.com'));
  assert.throws(() => renderDigestEmail(feed(), { ...options, siteUrl: 'https://user:pass@example.com/' }));
  assert.equal(gmailDigestReceiptQuery('Me@Example.com', '2026-10-04'), 'in:sent to:me@example.com subject:"财经阅读日报｜2026-10-04"');
});
test('并发重复触发只认领一次，成功回执使同日同收件人永久去重', () => {
  const ledger = new EmailOutbox(':memory:');
  try {
    const email = renderDigestEmail(feed(), options);
    const first = ledger.prepare(email, 'me@example.com', now), repeated = ledger.prepare(email, 'ME@example.com', now);
    assert.equal(first.key, repeated.key);
    const claim = ledger.claim(first.key, now)!;
    assert.equal(ledger.claim(first.key, now), null);
    assert.throws(() => ledger.acknowledge(first.key, 'wrong-token', 'provider-123', now));
    ledger.acknowledge(first.key, claim.claim_token!, 'provider-123', now);
    assert.equal(ledger.claim(first.key, now), null);
    assert.equal(ledger.prepare(email, 'me@example.com', now).state, 'sent');
  } finally { ledger.close(); }
});
test('明确拒绝按退避重试最多三次，超时结果不明必须核对回执再发', () => {
  const ledger = new EmailOutbox(':memory:');
  try {
    const email = renderDigestEmail(feed(), options);
    const entry = ledger.prepare(email, 'me@example.com', now), claim = ledger.claim(entry.key, now)!;
    ledger.fail(entry.key, claim.claim_token!, true, 'PROVIDER_REJECTED', now);
    assert.equal(ledger.claim(entry.key, new Date(now.getTime() + 9 * 60000)), null);
    const secondAt = new Date(now.getTime() + 10 * 60000), second = ledger.claim(entry.key, secondAt)!;
    ledger.fail(entry.key, second.claim_token!, true, 'PROVIDER_REJECTED', secondAt);
    const thirdAt = new Date(secondAt.getTime() + 30 * 60000), third = ledger.claim(entry.key, thirdAt)!;
    ledger.fail(entry.key, third.claim_token!, true, 'PROVIDER_REJECTED', thirdAt);
    assert.equal(ledger.claim(entry.key, new Date(thirdAt.getTime() + 60 * 60000)), null);
    const other = ledger.prepare(email, 'other@example.com', now), uncertain = ledger.claim(other.key, now)!;
    ledger.fail(other.key, uncertain.claim_token!, false, 'DELIVERY_TIMEOUT', now);
    assert.equal(ledger.get(other.key)?.state, 'uncertain');
    assert.equal(ledger.claim(other.key, new Date(now.getTime() + 86400000)), null);
    ledger.acknowledge(other.key, uncertain.claim_token!, 'provider-found-in-sent', now);
    assert.equal(ledger.get(other.key)?.state, 'sent');
  } finally { ledger.close(); }
});
test('未发送的同日邮件冻结内容，防止重试更换摘要', () => {
  const ledger = new EmailOutbox(':memory:');
  try {
    const email = renderDigestEmail(feed(), options);
    ledger.prepare(email, 'me@example.com', now);
    assert.throws(() => ledger.prepare({ ...email, text: email.text + '\n被替换' }, 'me@example.com', now));
  } finally { ledger.close(); }
});
