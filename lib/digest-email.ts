/** Email rendering consumes public, approved fields only; it runs in Node or a Worker. */
export type EmailArticle = {
  id: number;
  title: string;
  publisher: string;
  summary?: string | null;
  summaryKind?: 'model' | 'source_excerpt';
  factExcerpt?: string;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  url?: string;
  eventId?: string;
  sourceRole?: string;
  judgment?: { thesis: string; conditions?: string; counterpoint: string; watch: string } | null;
};
export type EmailFeed = {
  snapshotAt?: string;
  contentUpdatedAt?: string | null;
  articles: EmailArticle[];
  issues?: { date: string; articleIds: number[] }[];
};
export type DigestEmail = {
  businessDate: string;
  subject: string;
  text: string;
  html: string;
  state: 'current' | 'historical' | 'empty';
  sourceDate: string | null;
  articleIds: number[];
};

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const trim = (value: string | null | undefined, limit: number) => (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
export function validBusinessDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function emailBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function normalizeEmailRecipient(value: string): string {
  const recipient = value.trim().toLowerCase();
  if (recipient.length > 254 || !/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(recipient) || /[\r\n]/.test(value)) throw new Error('收件人必须是单个有效邮箱地址。');
  return recipient;
}
function sourceDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && !validBusinessDate(value.slice(0, 10))) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validBusinessDate(value) ? value : null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? emailBusinessDate(new Date(time)) : null;
}
function sourceUrl(value: string | undefined): string | null {
  try {
    const parsed = new URL(value || '');
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    for (const key of parsed.searchParams.keys()) if (/token|secret|password|signature|api.?key|authorization|credential/i.test(key)) return null;
    parsed.hash = '';
    return parsed.href;
  } catch { return null; }
}

/** Day is the delivery date; old materials retain their publication dates and a clear status. */
export function renderDigestEmail(feed: EmailFeed, options: { businessDate: string; siteUrl: string; now?: Date; limit?: number }): DigestEmail {
  if (!validBusinessDate(options.businessDate)) throw new Error('邮件业务日期无效。');
  const site = new URL(options.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw new Error('邮件站点地址必须是 HTTPS 根地址。');
  if (!Array.isArray(feed.articles)) throw new Error('邮件输入缺少公开材料列表。');
  const now = options.now || new Date();
  const rankTime = (article: EmailArticle) => {
    const value = Date.parse(article.publishedAt || article.fetchedAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  const seenIds = new Set<number>(), seenEvents = new Set<string>();
  const candidates = feed.articles.filter(article => Number.isSafeInteger(article.id) && article.id > 0 && typeof article.title === 'string' && typeof article.publisher === 'string')
    .filter(article => !sourceDate(article.publishedAt) || sourceDate(article.publishedAt)! <= options.businessDate)
    .filter(article => !article.publishedAt || /^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt) || !Number.isFinite(Date.parse(article.publishedAt)) || Date.parse(article.publishedAt) <= now.getTime() + 300000)
    .sort((a, b) => rankTime(b) - rankTime(a) || b.id - a.id);
  const selected = candidates.filter(article => {
    if (seenIds.has(article.id) || (article.eventId && seenEvents.has(article.eventId))) return false;
    seenIds.add(article.id); if (article.eventId) seenEvents.add(article.eventId); return true;
  }).slice(0, Math.max(1, Math.min(8, options.limit || 5)));
  const latestDate = candidates.map(article => sourceDate(article.publishedAt)).filter((date): date is string => Boolean(date)).sort().at(-1) || null;
  const fetched = Date.parse(feed.contentUpdatedAt || '');
  const age = now.getTime() - fetched;
  const publicationAge = latestDate ? Date.parse(options.businessDate + 'T00:00:00Z') - Date.parse(latestDate + 'T00:00:00Z') : Infinity;
  const state = !selected.length ? 'empty' : Number.isFinite(fetched) && age >= -300000 && age <= 36 * 3600000 && publicationAge <= 2 * 86400000 ? 'current' : 'historical';
  const subject = '财经阅读日报｜' + options.businessDate;
  const status = state === 'current' ? '最近阅读材料' : state === 'historical' ? '目前可读材料仍为历史收录' : '暂无可发送的公开材料';
  const note = state === 'historical' ? '本次发送的是已有资料的阅读入口。' + (latestDate ? '最新原始发布日期为 ' + latestDate + '。' : '原始发布日期尚未标注。') + '没有把它们当作今天的新消息。' : state === 'empty' ? '本次未取得通过公开发布检查的材料；稍后可在网页查看更新情况。' : '以下保留实际发布日期，摘要与原文可分别核对。';
  const rows = selected.map(article => {
    const materialUrl = site.origin + '/articles/' + article.id + '/';
    const original = sourceUrl(article.url);
    const date = sourceDate(article.publishedAt) || '发布日期未标注';
    const summary = trim(article.summary || article.factExcerpt, 240);
    const summaryKind = article.summaryKind || (article.summary ? 'model' : 'source_excerpt');
    const kindLabel = summaryKind === 'model' ? '模型摘要' : '来源摘录';
    const judgment = article.judgment?.conditions && article.judgment.counterpoint && article.judgment.watch ? article.judgment : null;
    const text = [trim(article.title, 180), trim(article.publisher, 100) + ' · ' + date, ...(summary ? [kindLabel + '：' + summary] : []), ...(judgment ? ['条件性判断：' + trim(judgment.thesis, 180), '成立条件：' + trim(judgment.conditions, 180), '反向检验：' + trim(judgment.counterpoint, 180), '继续跟踪：' + trim(judgment.watch, 180)] : []), '材料：' + materialUrl, ...(original ? ['原文：' + original] : [])].join('\n');
    const html = '<tr><td style="padding:24px 0;border-bottom:1px solid #dce6e1"><h2 style="font-size:19px;line-height:1.6;margin:0 0 6px"><a href="' + escape(materialUrl) + '" style="color:#163746;text-decoration:none">' + escape(trim(article.title, 180)) + '</a></h2><p style="font-size:13px;color:#61756e;margin:0 0 12px">' + escape(trim(article.publisher, 100)) + ' · ' + escape(date) + '</p>' + (summary ? '<p style="font-size:15px;line-height:1.9;margin:0"><span style="color:#14796a">' + kindLabel + '：</span>' + escape(summary) + '</p>' : '') + (judgment ? '<p style="font-size:14px;line-height:1.9;margin:12px 0 0"><strong>条件性判断</strong> ' + escape(trim(judgment.thesis, 180)) + '<br><strong>成立条件</strong> ' + escape(trim(judgment.conditions, 180)) + '<br><strong>反向检验</strong> ' + escape(trim(judgment.counterpoint, 180)) + '<br><strong>继续跟踪</strong> ' + escape(trim(judgment.watch, 180)) + '</p>' : '') + '<p style="font-size:14px;margin:14px 0 0"><a href="' + escape(materialUrl) + '" style="color:#14796a">查看材料</a>' + (original ? '　<a href="' + escape(original) + '" style="color:#14796a">核对原文</a>' : '') + '</p></td></tr>';
    return { text, html };
  });
  const footer = '个人财经阅读与研究。模型摘要和条件性判断需要核对，不构成交易建议。';
  const text = [subject, status, note, '', ...rows.map((row, index) => String(index + 1) + '. ' + row.text + '\n'), '继续阅读：' + site.origin + '/daily/', footer].join('\n');
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(subject) + '</title></head><body style="margin:0;padding:24px 12px;background:#f6f9f8;color:#163746;font-family:Arial,Microsoft YaHei,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto"><tr><td style="padding:24px;background:#ffffff;border-top:4px solid #14796a"><p style="font-size:13px;color:#14796a;margin:0 0 8px">财经阅读 · ' + options.businessDate + '</p><h1 style="font-size:25px;line-height:1.5;margin:0 0 14px">' + status + '</h1><p style="font-size:14px;line-height:1.8;color:#61756e;margin:0">' + escape(note) + '</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">' + rows.map(row => row.html).join('') + '</table><p style="margin:24px 0 12px"><a href="' + escape(site.origin + '/daily/') + '" style="display:inline-block;background:#14796a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px">继续阅读</a></p><p style="font-size:12px;line-height:1.8;color:#61756e;margin:0">' + footer + '</p></td></tr></table></body></html>';
  return { businessDate: options.businessDate, subject, text, html, state, sourceDate: latestDate, articleIds: selected.map(article => article.id) };
}

/** Search provider receipts before sending. An ambiguous provider result must be reconciled. */
export function gmailDigestReceiptQuery(recipient: string, businessDate: string): string {
  const address = normalizeEmailRecipient(recipient);
  if (!validBusinessDate(businessDate)) throw new Error('邮件业务日期无效。');
  return 'in:sent to:' + address + ' subject:"财经阅读日报｜' + businessDate + '"';
}
