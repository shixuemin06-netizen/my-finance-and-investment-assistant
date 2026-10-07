import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCloudSourceFetcher } from '../cloud-reader/feeds';
import { buildPublicEdition } from '../lib/public-edition';

const NOW = Date.parse('2026-10-04T05:00:00Z');
const FED = 'https://www.federalreserve.gov/feeds/press_monetary.xml';
const title = 'Federal Reserve monetary policy statement';
const body = 'The Federal Reserve monetary policy statement describes inflation and employment developments. The Committee will continue to assess the economic outlook and maintain careful monitoring of interest rates and financial conditions.';
const escaped = (text: string) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const item = (url: string, date = 'Fri, 02 Oct 2026 09:00:00 EST', description = body) => `<item><title>${title}</title><link>${escaped(url)}</link><pubDate>${date}</pubDate><description>${escaped(description)}</description></item>`;
const feed = (items: string[]) => '<rss><channel>' + items.join('') + '</channel></rss>';
const response = (text: string, status = 200, headers: Record<string, string> = {}) => new Response(text, { status, headers: { 'content-type':'text/xml', ...headers } });

test('cloud official collection keeps fixed sources, two requests at a time, ten rows and stable large ids', async () => {
  let active = 0, maximum = 0;
  const seen: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input); seen.push(url); active++; maximum = Math.max(maximum,active);
    try {
      await new Promise(resolve => setTimeout(resolve, 3));
      return url === FED ? response(feed(Array.from({ length: 13 }, (_, i) => item('https://www.federalreserve.gov/releases/policy-' + i + '.htm')))) : response('unavailable',403);
    } finally { active--; }
  };
  const result = await createCloudSourceFetcher(fetcher)(NOW);
  assert.equal(result.rows.length,10);
  assert.equal(maximum,2);
  assert.equal(seen.length,9);
  assert.equal(result.sources.find(source => source.id==='fed')?.accepted,10);
  assert.equal(result.sources.find(source => source.id==='bls-cpi')?.status,'failed');
  for (const row of result.rows) {
    assert.equal(row.id,parseInt(createHash('sha256').update(row.url).digest('hex').slice(0,12),16)+1_000_000);
    assert.ok(Number.isSafeInteger(row.id) && row.id>1_000_000);
    assert.equal(row.fetched_at,new Date(NOW).toISOString());
    assert.equal(row.published_at,'2026-10-02T14:00:00.000Z');
    assert.equal(row.source_type,'crawled');
    assert.equal(row.summary,null); assert.equal(row.judgment,null);
  }
  assert.equal(buildPublicEdition(result.rows,[],new Date(NOW).toISOString()).articles.length,10);
});

test('unknown, invalid and future dates and external links cannot become accepted rows; only three detail pages per source', async () => {
  const fetched: string[] = [];
  const detail = (id: string, titleText = title, date = '2026-10-02') => `<html><head><title>${titleText}</title><meta property="article:published_time" content="${date}"></head><body><article><h1>${titleText}</h1><p>${body}</p><p>${body}</p></article></body></html>`;
  const prefix = 'https://www.federalreserve.gov/releases/';
  const xml = feed([
    item(prefix+'future.htm','Fri, 02 Oct 2030 09:00:00 EST'),
    item(prefix+'unknown.htm',''),
    item(prefix+'invalid.htm','Mon, 30 Feb 2026 09:00:00 GMT'),
    item('https://127.0.0.1/private.htm'),
    item('https://other.example/report.htm'),
    item(prefix+'attachment.pdf'),
    item(prefix+'wrong.htm','Fri, 02 Oct 2026 09:00:00 EST',title),
    item(prefix+'date.htm','Fri, 02 Oct 2026 09:00:00 EST',title),
    item(prefix+'good.htm','Fri, 02 Oct 2026 09:00:00 EST',title),
    item(prefix+'limited.htm','Fri, 02 Oct 2026 09:00:00 EST',title),
  ]);
  const request: typeof fetch = async input => {
    const url = String(input); fetched.push(url);
    if (url===FED) return response(xml);
    if (!url.startsWith(prefix)) return response('unavailable',403);
    const html = url.endsWith('wrong.htm') ? detail('wrong','Unrelated employment archive') : url.endsWith('date.htm') ? detail('date',title,'2030-10-02') : detail('good');
    return response(html,200,{'content-type':'text/html'});
  };
  const result = await createCloudSourceFetcher(request)(NOW);
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].url,prefix+'good.htm');
  const details = fetched.filter(url => url.startsWith(prefix));
  assert.equal(details.length,3);
  assert.ok(!fetched.some(url=>url.includes('127.0.0.1')||url.includes('other.example')||/attachment|future|unknown|invalid|limited/.test(url)));
  assert.equal(result.sources.find(source=>source.id==='fed')?.status,'partial');
});

test('cross-origin redirects and oversized header or streamed bodies are rejected before extraction', async () => {
  for (const mode of ['redirect','header','stream'] as const) {
    const fetched: string[] = []; let cancelled = false;
    const request: typeof fetch = async input => {
      const url=String(input); fetched.push(url);
      if (url!==FED) return response('unavailable',403);
      if (mode==='redirect') return response('',302,{location:'https://127.0.0.1/private'});
      if (mode==='header') return response(feed([item('https://www.federalreserve.gov/releases/accepted.htm')]),200,{'content-length':'1000001'});
      return new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(1_000_001));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/xml'}});
    };
    const result=await createCloudSourceFetcher(request)(NOW);
    assert.equal(result.rows.length,0);
    assert.equal(result.sources.find(source=>source.id==='fed')?.status,'failed');
    assert.ok(result.sources.find(source=>source.id==='fed')?.error?.includes(mode==='redirect'?'source_redirect_rejected':'source_too_large'));
    assert.ok(!fetched.some(url=>url.includes('127.0.0.1')));
    if(mode==='stream')assert.equal(cancelled,true);
  }
});

test('a stalled official request times out and leaves failed source rows empty', async () => {
  const request: typeof fetch = async input => String(input)===FED ? new Promise<Response>(()=>{}) : response('unavailable',403);
  const start=Date.now(),result=await createCloudSourceFetcher(request)(NOW);
  assert.ok(Date.now()-start<10_000);
  assert.equal(result.rows.length,0);
  assert.equal(result.sources.find(source=>source.id==='fed')?.error,'source_timeout');
});
