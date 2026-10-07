/**
 * RSS 适配器。官方订阅仅提供标题时，在明确允许的同源 HTML 页面补取正文。
 * 附件、跨站重定向与失败页面保持为链接；绝不把错误页当作财经正文。
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchRSS } from '../lib/fetcher';
import { normalizeDate } from '../lib/time';
import { extractArticleHtml } from '../lib/extraction-quality';
import type { NormalizedArticle } from '../lib/types';
import type { RssSourceConfig } from './adapters/types';

const OFFICIAL_HTML_HOSTS = new Set([
  'www.federalreserve.gov', 'www.ecb.europa.eu', 'www.boj.or.jp', 'www.bls.gov',
  'www.bea.gov', 'www.eia.gov', 'ec.europa.eu', 'single-market-economy.ec.europa.eu',
  'www.stat.go.jp', 'www.imf.org', 'www.worldbank.org', 'www.meti.go.jp',
  'www.energy.gov', 'www.commerce.gov', 'www.census.gov',
]);
const MAX_HTML_BYTES = 1_000_000;
const MAX_BODY_CHARS = 40_000;
const MAX_EXPANSIONS = 6;
type HtmlResponse = {status:number;data:string;headers:Record<string,string|undefined>};
type HtmlRequest = (url:string)=>Promise<HtmlResponse>;
const requestHtml:HtmlRequest = async url => {
  const r = await axios.get<string>(url, {
    timeout:8_000, maxRedirects:0, maxContentLength:MAX_HTML_BYTES, responseType:'text',
    headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Accept':'text/html,application/xhtml+xml'},
    validateStatus:status=>status>=200 && status<400,
  });
  return {status:r.status,data:r.data,headers:{'content-type':typeof r.headers['content-type']==='string'?r.headers['content-type']:undefined,'location':typeof r.headers.location==='string'?r.headers.location:undefined}};
};
const attachment = /\.(?:pdf|xlsx?|csv|zip|docx?|pptx?|png|jpe?g|gif|xml|json)(?:$|\/)/i;

/** Only an official, HTTPS, exact-origin link may be expanded. */
export function canExpandOfficialRss(src:RssSourceConfig,link:string):boolean {
  if(src.tier!=='official'||!src.isPrimary)return false;
  try {
    const feed=new URL(src.url),url=new URL(link);
    return feed.protocol==='https:'&&url.protocol==='https:'&&url.origin===feed.origin&&
      !url.username&&!url.password&&!feed.username&&!feed.password&&
      (!url.port||url.port==='443')&&OFFICIAL_HTML_HOSTS.has(url.hostname)&&!attachment.test(url.pathname)&&!/(?:^|\/)index\.(?:html?|aspx?)$/i.test(url.pathname);
  }catch{return false;}
}

/** Extract prose without a body-wide fallback that could turn navigation into evidence. */
export function extractOfficialHtml(html:string):string {
  const result=extractArticleHtml(html,{url:'https://official.example/release'});
  return result.status==='accepted' ? result.text.slice(0,MAX_BODY_CHARS) : '';
}

async function fetchOfficialRssPage(src:RssSourceConfig,link:string,request:HtmlRequest=requestHtml):Promise<{body:string;html:string}|null> {
  if(!canExpandOfficialRss(src,link))return null;
  try {
    let url=link;
    for(let hops=0;hops<=2;hops++) {
      const r=await request(url);
      if(r.status>=300&&r.status<400) {
        if(!r.headers.location||hops===2)return null;
        const next=new URL(r.headers.location,url).href;
        if(!canExpandOfficialRss(src,next))return null;
        url=next;continue;
      }
      if(r.status!==200||!/^\s*(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(r.headers['content-type']||'')||
        typeof r.data!=='string'||Buffer.byteLength(r.data,'utf8')>MAX_HTML_BYTES)return null;
      const body=extractOfficialHtml(r.data);return body ? {body,html:r.data} : null;
    }
  }catch{/* A detail failure does not take down its usable RSS feed. */}
  return null;
}

export async function fetchOfficialRssBody(src:RssSourceConfig,link:string,request:HtmlRequest=requestHtml):Promise<string> {
  return (await fetchOfficialRssPage(src,link,request))?.body || '';
}

export async function crawlRssSource(src:RssSourceConfig,dependencies:{feed?:typeof fetchRSS;html?:HtmlRequest}={}):Promise<NormalizedArticle[]> {
  const items=await (dependencies.feed||fetchRSS)(src.url);
  const tier=src.tier??'community',fetchedAt=new Date().toISOString();
  const articles=items.filter(item=>/^https?:\/\//i.test(item.link)).slice(0,30).map(item=>{
    const url=item.link.replace(/^http:\/\//i,'https://');
    return {publisher:src.name,author:item.author||src.name,title:item.title,url,canonical_url:url,
      source_tier:tier,is_primary:src.isPrimary??false,raw_text:stripHtml(item.description)||item.title,
      raw_html:item.description||null,published_at:normalizeDate(item.pubDate),fetched_at:fetchedAt} satisfies NormalizedArticle;
  });
  const candidates=articles.filter(a=>a.raw_text.length<200&&canExpandOfficialRss(src,a.url)).slice(0,MAX_EXPANSIONS);
  // Two requests at a time and six pages per feed bound work during source outages.
  for(let i=0;i<candidates.length;i+=2)await Promise.all(candidates.slice(i,i+2).map(async a=>{
    const page=await fetchOfficialRssPage(src,a.url,dependencies.html);
    if(page && page.body.length>a.raw_text.length){a.raw_text=page.body;a.raw_html=page.html;}
  }));
  return articles;
}

function stripHtml(html:string):string {
  if(!html)return '';
  return cheerio.load(html).text().replace(/\s+/g,' ').trim();
}
