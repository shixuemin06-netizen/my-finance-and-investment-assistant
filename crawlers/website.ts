/**
 * Website adapter: retain the observed source page and extract one verified body.
 * Listing snippets are retained for review, never substituted for article prose.
 */
import axios from 'axios';
import iconv from 'iconv-lite';
import {extractPublishedDate} from './metadata';
import {extractArticleHtml, type ArticleExtraction} from '../lib/extraction-quality';
import type {NormalizedArticle} from '../lib/types';
import type {WebsiteSourceConfig} from './adapters/types';
import * as cheerio from 'cheerio';

type HtmlFetch = (url:string)=>Promise<{data:Uint8Array|string;contentType?:string}>;
const requestHtml:HtmlFetch = async url => {
  const result = await axios.get(url,{timeout:12000,maxContentLength:1_000_000,maxRedirects:3,responseType:'arraybuffer',
    headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Accept':'text/html,application/xhtml+xml'}});
  return {data:result.data,contentType:String(result.headers['content-type']||'')};
};
function decodeHtml(data:Uint8Array|string,contentType=''):string {
  if (typeof data==='string') return data;
  const raw=Buffer.from(data);
  // Buffer.toString never throws on GBK; identify charset instead of a dead catch.
  const declared=contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || raw.subarray(0,4096).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  return iconv.encodingExists(declared) ? iconv.decode(raw,declared) : raw.toString('utf8');
}

export async function fetchArticleText(url:string,expectedTitle?:string,request:HtmlFetch=requestHtml):Promise<{
  text:string;publishedAt:string|null;rawHtml:string|null;quality:ArticleExtraction|null;
}> {
  try {
    const response=await request(url);
    if (response.contentType && !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.contentType)) return {text:'',publishedAt:null,rawHtml:null,quality:null};
    const html=decodeHtml(response.data,response.contentType);
    if (Buffer.byteLength(html,'utf8')>1_000_000) return {text:'',publishedAt:null,rawHtml:null,quality:null};
    const quality=extractArticleHtml(html,{url,expectedTitle});
    return {text:quality.text,publishedAt:extractPublishedDate(html),rawHtml:html,quality};
  } catch {
    return {text:'',publishedAt:null,rawHtml:null,quality:null};
  }
}

export async function crawlWebsiteSource(src:WebsiteSourceConfig):Promise<NormalizedArticle[]> {
  const response=await requestHtml(src.listUrl),$=cheerio.load(decodeHtml(response.data,response.contentType));
  const links:Array<{title:string;url:string}>=[];
  $(src.articleSelector||'a').each((_,element)=>{
    const node=$(element),title=node.text().replace(/\s+/g,' ').trim(),href=(node.attr('href')||'').trim();
    if (!href || title.length<=5) return;
    try {
      const url=new URL(href,src.listUrl);
      if (!/^https?:$/.test(url.protocol)||url.username||url.password||url.href===src.listUrl) return;
      links.push({title,url:url.href});
    } catch {}
  });
  if (!links.length) throw Error('发布列表未返回可识别文章，保留最近成功结果');
  const fetchedAt=new Date().toISOString(),articles:NormalizedArticle[]=[];
  for(const link of [...new Map(links.map(item=>[item.url,item])).values()].slice(0,20)) {
    const result=await fetchArticleText(link.url,link.title);
    // Even a title-only source is a raw material in the review queue; quality
    // gates prevent summarization/publication until substantive prose is present.
    articles.push({publisher:src.name,author:null,title:link.title,url:link.url,canonical_url:result.quality?.canonicalUrl||link.url,
      source_tier:src.tier??'media',is_primary:src.isPrimary??false,raw_text:result.text||link.title,raw_html:result.rawHtml,
      published_at:result.publishedAt||extractDateFromUrl(link.url),fetched_at:fetchedAt});
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  return articles;
}

/** A URL date is a fallback only when it is a real calendar date. */
function extractDateFromUrl(url:string):string|null {
  const match=url.match(/(20\d{2})(\d{2})(\d{2})/);
  if(!match)return null;
  const value=match[1]+'-'+match[2]+'-'+match[3],date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value ? value : null;
}
