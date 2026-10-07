/** Separate, private delivery ledger. No migration of the research database is required. */
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeEmailRecipient, type DigestEmail } from './digest-email';

type DeliveryState = 'ready' | 'sending' | 'sent' | 'failed' | 'uncertain';
export type EmailDelivery = {
  key: string; business_date: string; recipient: string; subject: string; payload_hash: string;
  state: DeliveryState; attempts: number; claim_token: string | null; next_attempt_at: string | null;
  provider_id: string | null; last_error: string | null; updated_at: string;
};
export class EmailOutbox {
  private db: DatabaseSync;
  constructor(database: string) {
    if (database !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(database)), { recursive: true });
    this.db = new DatabaseSync(database);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS email_deliveries (
      key TEXT PRIMARY KEY, business_date TEXT NOT NULL, recipient TEXT NOT NULL,
      subject TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, claim_token TEXT, next_attempt_at TEXT,
      provider_id TEXT, last_error TEXT, updated_at TEXT NOT NULL,
      UNIQUE(business_date,recipient)
    )`);
  }
  close() { this.db.close(); }
  get(key: string): EmailDelivery | undefined { const row = this.db.prepare('SELECT * FROM email_deliveries WHERE key=?').get(key); return row ? { ...row } as EmailDelivery : undefined; }
  prepare(email: DigestEmail, recipientInput: string, now = new Date()): EmailDelivery {
    const recipient = normalizeEmailRecipient(recipientInput);
    const key = createHash('sha256').update('finance-email-v1\n' + email.businessDate + '\n' + recipient).digest('hex');
    const hash = createHash('sha256').update(email.subject + '\n' + email.text + '\n' + email.html).digest('hex');
    this.db.prepare("INSERT INTO email_deliveries(key,business_date,recipient,subject,payload_hash,state,updated_at) VALUES (?,?,?,?,?,'ready',?) ON CONFLICT(key) DO NOTHING").run(key, email.businessDate, recipient, email.subject, hash, now.toISOString());
    const delivery = this.get(key)!;
    if (delivery.payload_hash !== hash && delivery.state !== 'sent') throw new Error('同一天、同一收件人的邮件内容已冻结；请先核对已有投递记录，避免重发不同版本。');
    return delivery;
  }
  claim(key: string, now = new Date()): EmailDelivery | null {
    const token = randomUUID();
    const result = this.db.prepare("UPDATE email_deliveries SET state='sending',claim_token=?,attempts=attempts+1,updated_at=? WHERE key=? AND state IN ('ready','failed') AND attempts<3 AND (next_attempt_at IS NULL OR next_attempt_at<=?)").run(token, now.toISOString(), key, now.toISOString());
    return result.changes ? this.get(key)! : null;
  }
  acknowledge(key: string, token: string, providerId: string, now = new Date()): EmailDelivery {
    if (!providerId.trim() || providerId.length > 256) throw new Error('必须保存供应商返回的有效邮件 ID。');
    const result = this.db.prepare("UPDATE email_deliveries SET state='sent',provider_id=?,claim_token=NULL,next_attempt_at=NULL,last_error=NULL,updated_at=? WHERE key=? AND claim_token=? AND state IN ('sending','uncertain')").run(providerId, now.toISOString(), key, token);
    if (!result.changes) throw new Error('邮件回执与当前投递批次不一致。');
    return this.get(key)!;
  }
  fail(key: string, token: string, definite: boolean, reason: string, now = new Date()): EmailDelivery {
    const row = this.get(key);
    if (!row || row.claim_token !== token || row.state !== 'sending') throw new Error('失败记录与当前投递批次不一致。');
    // Exception details can contain secrets; retain only an explicit, short error code.
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(reason)) throw new Error('请使用不含个人信息和凭据的错误代码。');
    const next = definite ? new Date(now.getTime() + (row.attempts === 1 ? 10 : 30) * 60000).toISOString() : null;
    this.db.prepare('UPDATE email_deliveries SET state=?,next_attempt_at=?,last_error=?,updated_at=? WHERE key=? AND claim_token=?').run(definite ? 'failed' : 'uncertain', next, reason, now.toISOString(), key, token);
    return this.get(key)!;
  }
}
