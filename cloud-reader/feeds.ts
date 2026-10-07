/** Fixed public official feeds. No local state, model calls, credentials or user URLs. */
import { createHash } from 'node:crypto';
import { load } from 'cheerio/slim';
import sourceConfig from '../sources.json';
import { extractArticleHtml, titleBodyCoverage } from '../lib/extraction-quality';
import { assessContentQuality } from '../lib/content-quality';
import type { PublicInputArticle } from '../lib/public-edition';

const MAX_BYTES = 1_000_000;
const REQUEST_TIMEOUT = 8_000;
const RUN_TIMEOUT = 35_000;
const MAX_ITEMS = 10;
const MAX_DETAILS = 3;
const MAX_CONCURRENCY = 2;
const ATTACHMENT = /\.(?:pdf|xlsx?|csv|zip|docx?|pptx?|png|jpe?g|gif|xml|json)(?:$|\/)/i;
const USER_AGENT = 'Mozilla/5.0 (compatible; FinanceResearchReader/1.0; public official releases)';

export type CloudSourceHealth = {
  id: string; name: string; url: string; status: 'ok' | 'partial' | 'failed'; accepted: number; error?: string;
};
export type CloudSourceResult = { rows: PublicInputArticle[]; sources: CloudSourceHealth[] };
type Source = { id: string; name: string; url: string; format: 'rss' | 'nbs' | 'pboc' | 'csrc' };
type Candidate = { title: string; url: string; date: string | null; text: string; source: Source };
type Work = { source: Source; candidates: Candidate[]; accepted: PublicInputArticle[]; reasons: string[]; failed: boolean };

const RSS_ALLOWLIST = [
  ['fed', 'https://www.federalreserve.gov/feeds/press_monetary.xml'],
  ['ecb', 'https://www.ecb.europa.eu/rss/press.html'],
  ['boj', 'https://www.boj.or.jp/en/rss/whatsnew.xml'],
  ['bls-employment', 'https://www.bls.gov/feed/empsit.rss'],
  ['bls-cpi', 'https://www.bls.gov/feed/cpi.rss'],
  ['eia', 'https://www.eia.gov/rss/todayinenergy.xml'],
] as const;
const OFFICIAL_ALLOWLIST: Source[] = [
  { id: 'nbs', name: '国家统计局数据发布', format: 'nbs', url: 'https://www.stats.gov.cn/sj/zxfbhjd/' },
  { id: 'pboc', name: '人民银行政策公告', format: 'pboc', url: 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html' },
  { id: 'csrc', name: '证监会要闻', format: 'csrc', url: 'https://www.csrc.gov.cn/searchList/a1a078ee0bc54721ab6b148884c784a8?_isAgg=true&_isJson=true&_pageSize=10&_template=index&_rangeTimeGte=&_channelName=&page=1' },
];

function configuredSources(): Source[] {
  const rss = RSS_ALLOWLIST.flatMap(([id, url]) => {
    const item = sourceConfig.rss.find(row => row.url === url && row.enabled && row.tier === 'official' && row.isPrimary);
    return item ? [{ id, name: item.name, url, format: 'rss' as const }] : [];
  });
  return [...rss, ...OFFICIAL_ALLOWLIST.filter(source => sourceConfig.official.some(row => row.id === source.id && row.enabled))];
}

function day(value: string): string | null {
  const match = value.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:$|\s|T)/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const time = Date.parse(iso + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
}

function publicationDate(value: string, source: Source, now: number): string | null {
  const clean = value.trim();
  if (!clean) return null;
  const calendar = day(clean);
  if (/^20\d{2}[-/]\d/.test(clean) && !calendar) return null;
  if (calendar) {
    const today = new Date(now + (source.format === 'rss' ? 0 : 8 * 3_600_000)).toISOString().slice(0, 10);
    if (calendar > today) return null;
    if (/^20\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(clean) || source.format !== 'rss') return calendar;
  }
  const rfc = clean.match(/(?:^|\s)(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\b/i);
  if (rfc) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(rfc[2].toLowerCase()) + 1;
    if (!day(`${rfc[3]}-${month}-${rfc[1]}`)) return null;
  }
  // RSS dates must declare a time zone; local-machine parsing is never publication evidence.
  if (!/(?:Z|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC|UT|[ECMP][DS]T))\s*$/i.test(clean)) return null;
  const timestamp = Date.parse(clean);
  return Number.isFinite(timestamp) && timestamp <= now ? new Date(timestamp).toISOString() : null;
}

function sourceLink(source: Source, value: string, detail = false): string | null {
  try {
    const root = new URL(source.url), url = new URL(value, root);
    if (url.protocol === 'http:' && url.hostname === root.hostname) url.protocol = 'https:';
    if (url.origin !== root.origin || url.username || url.password || ATTACHMENT.test(url.pathname)) return null;
    for (const key of url.searchParams.keys()) if (/token|secret|password|signature|api.?key|authorization/i.test(key)) return null;
    if (detail && url.href === root.href) return null;
    url.hash = '';
    // ECB occasionally emits a duplicate slash; this is still the exact official origin.
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    return url.href;
  } catch { return null; }
}

function prose(fragment: string): string {
  const $ = load(fragment);
  $('script,style,nav,footer,header,aside,form,iframe,noscript').remove();
  $('br').replaceWith('\n');
  $('p,li,blockquote,tr').append('\n\n');
  return $.text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 40_000);
}

function row(candidate: Candidate, now: number, html: string | null = null): PublicInputArticle | null {
  if (!candidate.date) return null;
  const result: PublicInputArticle = {
    id: parseInt(createHash('sha256').update(candidate.url).digest('hex').slice(0, 12), 16) + 1_000_000,
    title: candidate.title, url: candidate.url, canonical_url: candidate.url,
    publisher: candidate.source.name, published_at: candidate.date, fetched_at: new Date(now).toISOString(),
    source_tier: 'official', is_primary: 1, source_type: 'crawled', raw_text: candidate.text, raw_html: html,
    summary: null, judgment: null, tags: null, title_zh: null,
  };
  return assessContentQuality(result).status === 'accepted' ? result : null;
}

async function mapBounded<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) await work(items[cursor++]);
  }));
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 120) : 'source_request_failed';
}

/** Injecting fetch supports deterministic tests; URLs and sources remain fixed by this module. */
export function createCloudSourceFetcher(requestFetch: typeof fetch) {
  return async (now = Date.now()): Promise<CloudSourceResult> => {
    if (!Number.isFinite(now)) throw new Error('invalid_collection_time');
    const deadline = Date.now() + RUN_TIMEOUT;
    const globalAbort = new AbortController();
    const runTimer = setTimeout(() => globalAbort.abort(new Error('collection_deadline')), RUN_TIMEOUT);
    const states: Work[] = configuredSources().map(source => ({ source, candidates: [], accepted: [], reasons: [], failed: false }));

    async function fetchText(source: Source, input: string, kind: 'feed' | 'html' | 'json'): Promise<string> {
      const permitted = input === source.url ? input : sourceLink(source, input, true);
      if (!permitted) throw new Error('source_url_rejected');
      if (globalAbort.signal.aborted || Date.now() >= deadline) throw new Error('collection_deadline');
      const controller = new AbortController();
      const abort = () => controller.abort(new Error('collection_deadline'));
      globalAbort.signal.addEventListener('abort', abort, { once: true });
      let rejectTimeout!: (reason: Error) => void;
      const expiry = new Promise<never>((_, reject) => { rejectTimeout = reject; });
      const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error('source_timeout')); }, Math.min(REQUEST_TIMEOUT, deadline - Date.now()));
      try {
        return await Promise.race([(async () => {
          let url = permitted;
          for (let hops = 0; hops <= 2; hops++) {
            const response = await requestFetch(url, {
              redirect: 'manual', signal: controller.signal,
              headers: { 'User-Agent': USER_AGENT, Accept: kind === 'html' ? 'text/html,application/xhtml+xml' : kind === 'json' ? 'application/json' : 'application/rss+xml,application/xml,text/xml' },
            });
            if (response.status >= 300 && response.status < 400) {
              await response.body?.cancel();
              const location = response.headers.get('location');
              const next = location && sourceLink(source, new URL(location, url).href);
              if (!next || hops === 2) throw new Error('source_redirect_rejected');
              url = next; continue;
            }
            if (response.status !== 200) { await response.body?.cancel(); throw new Error('source_http_' + response.status); }
            const contentType = response.headers.get('content-type') || '';
            if (kind === 'html' && !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) { await response.body?.cancel(); throw new Error('detail_not_html'); }
            if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('source_too_large'); }
            if (!response.body) throw new Error('source_empty_body');
            const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
            try {
              while (true) {
                const chunk = await reader.read(); if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > MAX_BYTES) { await reader.cancel(); throw new Error('source_too_large'); }
                chunks.push(chunk.value);
              }
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            const prefix = new TextDecoder().decode(bytes.subarray(0, 4_096));
            const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || prefix.match(/(?:charset\s*=|encoding\s*=)\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
            try { return new TextDecoder(charset).decode(bytes); } catch { throw new Error('source_charset_unsupported'); }
          }
          throw new Error('source_redirect_limit');
        })(), expiry]);
      } finally { clearTimeout(timer); globalAbort.signal.removeEventListener('abort', abort); }
    }

    function candidate(source: Source, title: string, link: string, date: string, text = ''): Candidate | null {
      const url = sourceLink(source, link, true), cleanTitle = prose(title).replace(/\s+/g, ' ').trim();
      if (!url || cleanTitle.length < 8 || cleanTitle.length > 300) return null;
      return { source, title: cleanTitle, url, date: publicationDate(date, source, now), text: prose(text) };
    }

    async function readSource(state: Work) {
      const source = state.source;
      try {
        const content = await fetchText(source, source.url, source.format === 'rss' ? 'feed' : source.format === 'csrc' ? 'json' : 'html');
        const seen = new Set<string>();
        const add = (item: Candidate | null) => { if (item && !seen.has(item.url) && state.candidates.length < MAX_ITEMS) { seen.add(item.url); state.candidates.push(item); } };
        if (source.format === 'rss') {
          if (!/<(?:rss|feed|rdf:RDF)\b/i.test(content)) throw new Error('source_invalid_feed');
          const $ = load(content, { xmlMode: true });
          $('item,entry').slice(0, MAX_ITEMS).each((_, el) => {
            const item = $(el), alternate = item.find('link[rel="alternate"]').first();
            add(candidate(source, item.find('title').first().text(), alternate.attr('href') || item.find('link').first().attr('href') || item.find('link').first().text(),
              item.find('pubDate,published,updated,dc\\:date').first().text(), item.find('content\\:encoded,description,content,summary').first().text()));
          });
        } else if (source.format === 'csrc') {
          const data: unknown = JSON.parse(content);
          const items = (data as { data?: { results?: unknown } })?.data?.results;
          if (!Array.isArray(items)) throw new Error('source_invalid_official_list');
          for (const item of items.slice(0, MAX_ITEMS)) if (item && typeof item === 'object') {
            const value = item as Record<string, unknown>;
            if (typeof value.title === 'string' && typeof value.url === 'string') add(candidate(source, value.title, value.url, typeof value.publishedTimeStr === 'string' ? value.publishedTimeStr : ''));
          }
        } else {
          const $ = load(content);
          $('a').each((_, el) => {
            const anchor = $(el), href = anchor.attr('href') || '';
            if (source.format === 'pboc' && !href.includes('/125475/')) return;
            const dateMatch = href.match(/(20\d{2})(\d{2})(\d{2})/);
            if (!dateMatch) return;
            const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            add(candidate(source, anchor.attr('title') || anchor.text(), href, date));
          });
        }
        if (!state.candidates.length) throw new Error('source_no_supported_articles');
      } catch (error) { state.failed = true; state.reasons.push(safeError(error)); }
    }

    async function readDetail(state: Work, item: Candidate) {
      try {
        const html = await fetchText(item.source, item.url, 'html'), $ = load(html);
        const metaTitle = $('meta[name="ArticleTitle"]').first().attr('content');
        if (metaTitle && titleBodyCoverage(item.title, metaTitle) < .45) throw new Error('detail_title_mismatch');
        const pageDate = ['meta[property="article:published_time"]','meta[name="PubDate"]','meta[name="publishdate"]','meta[name="pubdate"]','meta[name="date"]','meta[name="publish_date"]']
          .map(selector => $(selector).first().attr('content')).find(Boolean);
        if (pageDate) {
          const checked = publicationDate(pageDate, item.source, now);
          if (!checked) throw new Error('detail_date_invalid');
          if (item.date && checked.slice(0, 10) !== item.date.slice(0, 10)) throw new Error('detail_date_mismatch');
          item.date = checked;
        }
        let extraction = extractArticleHtml(html, { url: item.url, expectedTitle: item.title });
        let observedHtml: string | null = html;
        // PBOC's verified td.content/#zoom is not a generic page-wide fallback.
        // Re-audit only that source container; retain prose, never pretend reconstructed HTML is raw HTML.
        if (item.source.format === 'pboc' && extraction.status !== 'accepted' && metaTitle) {
          const body = $('td.content#zoom,td.content #zoom,#zoom.content,td.content').first();
          if (body.length && body.text().trim().length >= 120) {
            const escaped = metaTitle.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
            extraction = extractArticleHtml('<html><head><title>' + escaped + '</title></head><body><article>' + body.html() + '</article></body></html>', { url: item.url, expectedTitle: item.title });
            observedHtml = null;
          }
        }
        if (extraction.status !== 'accepted') throw new Error('detail_quality_' + extraction.reasons.join('_').slice(0, 70));
        const accepted = row({ ...item, text: extraction.text }, now, observedHtml);
        if (!accepted) throw new Error('detail_quality_or_date_rejected');
        state.accepted.push(accepted);
      } catch (error) { state.reasons.push(safeError(error)); }
    }

    try {
      // Read all feeds before expansions so a slow detail cannot starve other official sources.
      await mapBounded(states, readSource);
      const details: Array<{ state: Work; item: Candidate }> = [];
      for (const state of states) {
        let expansions = 0;
        for (const item of state.candidates) {
          if (!item.date) { state.reasons.push('publication_date_missing_or_future'); continue; }
          const accepted = row(item, now);
          if (accepted) state.accepted.push(accepted);
          else if (expansions < MAX_DETAILS) { details.push({ state, item }); expansions++; }
          else state.reasons.push('detail_limit');
        }
      }
      await mapBounded(details, ({ state, item }) => readDetail(state, item));
    } finally { clearTimeout(runTimer); globalAbort.abort(); }
    return {
      rows: states.flatMap(state => state.accepted).slice(0, states.length * MAX_ITEMS),
      sources: states.map(state => ({
        id: state.source.id, name: state.source.name, url: state.source.url,
        status: state.failed || !state.accepted.length ? 'failed' : state.reasons.length ? 'partial' : 'ok',
        accepted: state.accepted.length,
        ...(state.reasons.length ? { error: [...new Set(state.reasons)].slice(0, 4).join('; ') } : {}),
      })),
    };
  };
}

export async function fetchCloudSources(now = Date.now()): Promise<CloudSourceResult> {
  return createCloudSourceFetcher(fetch)(now);
}
