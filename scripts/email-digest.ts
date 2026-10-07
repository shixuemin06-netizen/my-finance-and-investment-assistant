/** Explicit email preview / ledger CLI. Sending stays with the authorized provider. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildPublicEdition, type PublicInputArticle, type PublicInputDigest } from '../lib/public-edition';
import { emailBusinessDate, gmailDigestReceiptQuery, normalizeEmailRecipient, renderDigestEmail, type EmailFeed } from '../lib/digest-email';
import { EmailOutbox } from '../lib/email-outbox';

const option = (key: string) => process.argv.find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
const required = (key: string) => { const value = option(key); if (!value) throw new Error('缺少 --' + key + '= 参数。'); return value; };
const command = process.argv[2] || 'preview';
const today = option('date') || emailBusinessDate();
const ledgerPath = path.resolve(option('ledger') || 'data/email-outbox.db');
if (path.basename(ledgerPath) !== 'email-outbox.db') throw new Error('投递账本必须是独立的 email-outbox.db，禁止使用研究数据库。');
function feed(): EmailFeed {
  const feedPath = option('feed'), dbPath = option('db');
  if (Boolean(feedPath) === Boolean(dbPath)) throw new Error('必须且只能指定 --feed=公开 JSON 或 --db=只读研究快照。');
  if (feedPath) return JSON.parse(fs.readFileSync(path.resolve(feedPath), 'utf8')) as EmailFeed;
  const resolved = path.resolve(dbPath!);
  if (resolved === ledgerPath) throw new Error('材料数据库与邮件账本不能是同一文件。');
  const database = new DatabaseSync(resolved, { readOnly: true });
  try {
    const basis = Boolean(database.prepare("SELECT name FROM sqlite_master WHERE name='generation_basis'").get());
    const rows = database.prepare('SELECT a.id,a.title,a.url,a.canonical_url,a.publisher,a.published_at,a.fetched_at,a.source_tier,a.is_primary,a.source_type,a.raw_text,a.raw_html,s.summary,s.tags,s.generated_at summary_generated_at,tr.title_zh,j.content judgment,' + (basis ? 'b.source_fingerprint,b.basis_kind,b.generated_at generation_at' : 'NULL source_fingerprint,NULL basis_kind,NULL generation_at') + ' FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id ' + (basis ? 'LEFT JOIN generation_basis b ON b.article_id=a.id ' : '') + "WHERE a.source_type='crawled' ORDER BY a.id DESC").all() as PublicInputArticle[];
    const digests = database.prepare('SELECT date,article_ids,generated_at FROM digests ORDER BY date DESC').all() as PublicInputDigest[];
    return buildPublicEdition(rows, digests);
  } finally { database.close(); }
}
if (command === 'receipt-query') {
  console.log(gmailDigestReceiptQuery(required('recipient'), today));
} else if (command === 'preview' || command === 'prepare') {
  const recipient = option('recipient') ? normalizeEmailRecipient(option('recipient')!) : undefined;
  if (command === 'prepare' && !recipient) throw new Error('准备投递必须显式指定 --recipient=。');
  const message = renderDigestEmail(feed(), { businessDate: today, siteUrl: required('site-url') });
  let delivery;
  if (command === 'prepare') {
    const ledger = new EmailOutbox(ledgerPath);
    try { delivery = ledger.prepare(message, recipient!); } finally { ledger.close(); }
  }
  if (delivery?.state === 'sent') console.log(JSON.stringify({ state: 'already_sent', key: delivery.key, providerId: delivery.provider_id, businessDate: message.businessDate }));
  else {
    const output = path.resolve(required('out'));
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'digest-email.html'), message.html, 'utf8');
    fs.writeFileSync(path.join(output, 'digest-email.txt'), message.text, 'utf8');
    fs.writeFileSync(path.join(output, 'digest-email.json'), JSON.stringify({ ...message, ...(recipient ? { recipient } : {}), ...(delivery ? { deliveryKey: delivery.key } : {}) }, null, 2), 'utf8');
    console.log(JSON.stringify({ output, businessDate: message.businessDate, sourceDate: message.sourceDate, contentState: message.state, articleIds: message.articleIds, ...(delivery ? { deliveryState: delivery.state, key: delivery.key } : {}) }));
  }
} else {
  const ledger = new EmailOutbox(ledgerPath);
  try {
    const key = required('key');
    let result;
    if (command === 'status') result = ledger.get(key) || null;
    else if (command === 'claim') result = ledger.claim(key);
    else if (command === 'acknowledge') result = ledger.acknowledge(key, required('claim-token'), required('provider-id'));
    else if (command === 'fail') result = ledger.fail(key, required('claim-token'), option('definite') === 'true', required('error-code'));
    else throw new Error('支持 preview、prepare、claim、status、acknowledge、fail、receipt-query。');
    console.log(JSON.stringify(result));
  } finally { ledger.close(); }
}
