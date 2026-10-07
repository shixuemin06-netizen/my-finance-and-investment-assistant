import {test} from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import {extractArticleHtml,auditExtractedText} from '../lib/extraction-quality';
import {fetchArticleText} from '../crawlers/website';
const url='https://publisher.example/news/20260925/a.html';
const solar='隆基绿能自主研发晶硅电池，光电转换效率达到28.29%。光伏企业发布技术成果，后续需要核对检测报告和量产成本。';
const buyback='中际旭创公司公告回购进展，资金支出达到49.97亿元，回购股份用于股权激励，公司基本面需要跟踪。';

test('single semantic body wins over many longer recommendation containers',()=>{
 const html='<html><title>晶硅电池效率刷新纪录</title><div class="detail-content"><p>'+solar.repeat(4)+'</p></div>'+Array.from({length:8},()=>'<div class="content"><h3><a href="/other">中际旭创回购</a></h3><div class="text ellipsis-2">'+buyback.repeat(3)+'</div><span>证券时报网</span><span>2026-09-24 22:19</span></div>').join('')+'</html>';
 const result=extractArticleHtml(html,{url,expectedTitle:'晶硅电池效率刷新纪录'});
 assert.equal(result.status,'accepted');assert.equal(result.selector,'.detail-content');assert.match(result.text,/28.29%/);assert.doesNotMatch(result.text,/中际旭创/);
});
test('listing and access-denied pages do not become financial evidence even with long text',()=>{
 const listing='<html><title>财经栏目</title><main>'+Array.from({length:5},(_,i)=>'<div class="list-item"><a href="/'+i+'">'+solar+'</a><p>'+buyback+'</p></div>').join('')+'</main></html>';
 assert.equal(extractArticleHtml(listing,{url}).status,'review');
 assert.equal(extractArticleHtml('<html><title>Access denied</title><main><p>Access denied '+solar.repeat(5)+'</p></main></html>',{url}).status,'review');
});
test('historical recommendation records are detected by structure, not topic similarity alone',()=>{
 const text=Array.from({length:4},()=>buyback+'\n\n证券时报网\n\n严翠\n\n2026-09-24 22:19').join('\n\n');
 const result=auditExtractedText({title:'中际旭创股份回购进展',raw_text:text,url});
 assert.equal(result.status,'review');assert.ok(result.reasons.includes('repeated_listing_records'));
 const valid=Array.from({length:4},(_,i)=>'2026-09-'+(20+i)+' 公司发布连续进展。'+buyback).join('\n\n');
 assert.equal(auditExtractedText({title:'中际旭创股份回购进展',raw_text:valid,url}).status,'accepted');
});
test('title-only material and a mismatched fetched detail require review',()=>{
 assert.ok(auditExtractedText({title:'只有标题的材料',raw_text:'只有标题的材料'}).reasons.includes('insufficient_body'));
 const result=extractArticleHtml('<title>中际旭创股份回购完成</title><article><p>'+buyback.repeat(5)+'</p></article>',{url,expectedTitle:'隆基绿能晶硅电池效率纪录'});
 assert.ok(result.reasons.includes('detail_title_mismatch'));assert.ok(result.reasons.includes('title_body_coverage_low'));
});
test('article sections retain prose boundaries and actual source publication metadata',async()=>{
 const html='<title>晶硅电池效率刷新纪录</title><meta property="article:published_time" content="2026-09-25T08:14:00+08:00"><article><h2>晶硅电池成果</h2><p>'+solar.repeat(3)+'</p><p>2026年9月24日是报道中的事实日期，不能取代原始发布日期。'+solar+'</p></article>';
 const result=await fetchArticleText(url,'晶硅电池效率刷新纪录',async()=>({data:html,contentType:'text/html; charset=utf-8'}));
 assert.equal(result.publishedAt,'2026-09-25');assert.match(result.text,/\n\n/);assert.equal(result.rawHtml,html);
});
test('GBK-declared pages decode correctly, rather than silently using invalid UTF-8',async()=>{
 const html='<html><meta charset="gbk"><title>晶硅电池效率刷新纪录</title><article><p>'+solar.repeat(4)+'</p></article></html>';
 const result=await fetchArticleText(url,'晶硅电池效率刷新纪录',async()=>({data:iconv.encode(html,'gbk'),contentType:'text/html; charset=gbk'}));
 assert.equal(result.quality?.status,'accepted');assert.match(result.text,/隆基绿能/);assert.doesNotMatch(result.text,/�/);
});

test('official release heading and host-scoped body exclude corporate headings and reference panels',()=>{
 const title='Gross Domestic Product for Puerto Rico, 2023',prose='Gross domestic product for Puerto Rico grew in 2023. The release describes the statistical period, measurement units and revision conditions. ';
 const html='<title>'+title+' | BEA</title><h1>News Release</h1><h1>'+title+'</h1><article><div class="release-body"><p>'+prose.repeat(4)+'</p></div><div>'+Array.from({length:10},()=>'<a href="/release">Other releases '+prose+'</a>').join('')+'</div></article>';
 const result=extractArticleHtml(html,{url:'https://www.bea.gov/news/2025/release',expectedTitle:title});
 assert.equal(result.pageTitle,title);assert.equal(result.selector,'.release-body');assert.equal(result.status,'accepted');assert.doesNotMatch(result.text,/Other releases/);
});
test('official ministry prose in nested divs is retained without global paragraph fallback',()=>{
 const title='中秋国庆假期出游提示',main='<div>中秋国庆假期出游提示，公众应选择正规旅游服务并核对合同。2026年9月22日发布最新提示。</div>';
 const html='<title>'+title+'</title><div id="zoom"><div class="TRS_Editor">'+main.repeat(4)+'<p>出行安全和交通信息需要持续留意。</p></div></div><div class="content"><p>'+buyback.repeat(20)+'</p></div>';
 const result=extractArticleHtml(html,{url:'https://www.mct.gov.cn/whzx/whyw/202609/article.htm',expectedTitle:title});
 assert.equal(result.selector,'#zoom');assert.equal(result.status,'accepted');assert.match(result.text,/2026年9月22日/);assert.doesNotMatch(result.text,/中际旭创/);
});
test('image-only source body cannot be replaced with topically similar recommendations',()=>{
 const html='<title>宏观政策新进展</title><div class="detail-content"><p><img src="/infographic.png" alt="图解"></p></div><div class="recommend"><p>宏观政策新进展 '+buyback.repeat(6)+'</p></div>';
 const result=extractArticleHtml(html,{url:'https://www.stcn.com/article/detail/example.html',expectedTitle:'宏观政策新进展'});
 assert.equal(result.status,'review');assert.equal(result.text,'');
});
