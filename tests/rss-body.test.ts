import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.FINANCE_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'finance-rss-body-'));
delete process.env.ZHIPU_API_KEY;delete process.env.DEEPSEEK_API_KEY;
const {canExpandOfficialRss,extractOfficialHtml,fetchOfficialRssBody,crawlRssSource}=await import('../crawlers/rss');
const {summaryStatus,storySummaryStatuses}=await import('../lib/summary-status');
const src={name:'Fed fixture',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',enabled:true,tier:'official' as const,isPrimary:true};
const link='https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm';
const prose='A policy statement describes the economic outlook and the conditions for future monetary policy decisions. '.repeat(4);
const html='<html><nav>Navigation that should never become evidence</nav><main><h1>Policy release</h1><p>'+prose+'</p><script>secret</script></main><footer>Footer</footer></html>';
test('official RSS expansion rejects off-origin, credentials, ports and attachments',()=>{
 assert.equal(canExpandOfficialRss(src,link),true);
 for(const url of ['http://www.federalreserve.gov/x','https://evil.example/x','https://www.federalreserve.gov:8443/x','https://user:pass@www.federalreserve.gov/x','https://www.federalreserve.gov/x.pdf','https://www.federalreserve.gov/statistics/index.htm'])assert.equal(canExpandOfficialRss(src,url),false);
 assert.equal(canExpandOfficialRss({...src,tier:'media' as any},link),false);
 assert.equal(canExpandOfficialRss({...src,url:'https://unverified.gov/feed'},'https://unverified.gov/article'),false);
});
test('HTML fixture yields prose, excluding navigation and code',()=>{
 const text=extractOfficialHtml(html);assert.match(text,/economic outlook/);assert.doesNotMatch(text,/Navigation|Footer|secret/);
 assert.equal(extractOfficialHtml('<body><nav>'+prose+'</nav></body>'),'');
 assert.equal(extractOfficialHtml('<main>Access denied '+prose+'</main>'),'');
});
test('redirects remain same origin; binary and oversized responses are not prose',async()=>{
 let calls=0;
 assert.equal(await fetchOfficialRssBody(src,link,async()=>{calls++;return {status:302,data:'',headers:{location:'https://evil.example/x'}};}),'');assert.equal(calls,1);
 assert.equal(await fetchOfficialRssBody(src,link,async()=>({status:200,data:html,headers:{'content-type':'application/pdf'}})),'');
 assert.equal(await fetchOfficialRssBody(src,link,async()=>({status:200,data:'x'.repeat(1_000_001),headers:{'content-type':'text/html'}})),'');
 const body=await fetchOfficialRssBody(src,link,async()=>({status:200,data:html,headers:{'content-type':'text/html; charset=UTF-8'}}));assert.match(body,/economic outlook/);
});
test('detail failure keeps its RSS entry and successful later entry; attachment not requested',async()=>{
 const entries=[{title:'First title',link,pubDate:'2026-09-26',description:'',author:''},{title:'Second title',link:link+'?second',pubDate:'2026-09-26',description:'',author:''},{title:'Attachment title',link:'https://www.federalreserve.gov/file.pdf',pubDate:'2026-09-26',description:'',author:''}];
 let calls=0;
 const result=await crawlRssSource(src,{feed:async()=>entries,html:async url=>{calls++;if(url===link)throw Error('simulated offline');return {status:200,data:html,headers:{'content-type':'text/html'}};}});
 assert.equal(result.length,3);assert.equal(calls,2);assert.equal(result[0].raw_text,'First title');assert.match(result[1].raw_text||'',/economic outlook/);assert.equal(result[2].raw_text,'Attachment title');
});
test('summary absence distinguishes attachment, title-only, archive, failed and queued material',()=>{
 const now=Date.parse('2026-09-26T09:00:00Z'),base={title:'Source title',raw_text:prose,fetched_at:'2026-09-26T08:00:00Z',published_at:'2026-09-26'};
 assert.equal(summaryStatus({...base,summary:'Saved summary'},now).kind,'ready');
 assert.equal(summaryStatus({...base,raw_text:'Source title',url:'https://example.org/report.pdf'},now).kind,'attachment');
 assert.equal(summaryStatus({...base,raw_text:'Source title'},now).kind,'title_only');
 assert.equal(summaryStatus({...base,published_at:'2026-09-01'},now).kind,'historical');
 const failed=summaryStatus({...base,failure_status:'sensitive provider details'},now);assert.equal(failed.kind,'failed');assert.doesNotMatch(failed.message,/sensitive/);
 assert.equal(summaryStatus(base,now).kind,'pending');
 assert.equal(storySummaryStatuses([]).size,0);
});

test('feed expansion stays bounded at six pages and two concurrent requests',async()=>{
 const entries=Array.from({length:9},(_,i)=>({title:'Title '+i,link:link+'?entry='+i,pubDate:'2026-09-26',description:'',author:''}));
 let calls=0,active=0,peak=0;
 const result=await crawlRssSource(src,{feed:async()=>entries,html:async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,0));active--;return {status:200,data:html,headers:{'content-type':'text/html'}};}});
 assert.equal(calls,6);assert.equal(peak,2);assert.equal(result.length,9);assert.equal(result[8].raw_text,'Title 8');
});
