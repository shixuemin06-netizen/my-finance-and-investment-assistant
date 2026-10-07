import * as cheerio from 'cheerio';

export type ExtractionStatus = 'accepted' | 'review';
export type ExtractionPageType = 'article' | 'listing' | 'error' | 'unknown';
export interface ExtractionAudit {
  status: ExtractionStatus;
  reasons: string[];
  bodyChars: number;
  titleCoverage: number;
  pageType: ExtractionPageType;
  paragraphCount: number;
  linkDensity: number;
}
export interface ArticleExtraction extends ExtractionAudit {
  text: string;
  pageTitle: string;
  canonicalUrl: string | null;
  selector: string | null;
}
const clean = (value: string) => value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const normalize = (value: string) => value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const dateLine = /^(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
const errorPage = /^(?:access denied|forbidden|request rejected|service unavailable|page not found|403\b|404\b|访问被拒绝|页面不存在|安全验证)/i;

/** A review signal, never a claim that lexical overlap proves factual agreement. */
export function titleBodyCoverage(title: string, body: string): number {
  const normalizedBody = normalize(body);
  const chunks = title.toLowerCase().match(/[a-z][a-z0-9.-]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  const terms = new Set<string>();
  for (const chunk of chunks) {
    if (/^[a-z]/.test(chunk)) terms.add(chunk);
    else for (let i = 0; i < chunk.length - 1; i++) terms.add(chunk.slice(i, i + 2));
  }
  if (!terms.size) return 0;
  return [...terms].filter(term => normalizedBody.includes(term)).length / terms.size;
}

/** Audit older extracted prose when the original HTML was not retained. */
export function auditExtractedText(input: {title: string; raw_text?: string | null; url?: string | null}): ExtractionAudit {
  const text = clean(input.raw_text || ''), lines = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const reasons: string[] = [];
  const titleCoverage = titleBodyCoverage(input.title, text);
  const paragraphCount = lines.filter(p => p.length >= 30).length;
  const timestamps = lines.filter(p => dateLine.test(p)).length;
  const sourceLines = lines.filter(p => /^(?:证券时报网|数据宝|人民财讯|来源[:：].{1,30}|作者[:：].{1,30})$/.test(p)).length;
  const truncated = lines.filter(p => /(?:&nbs|\|STCN\w+\||option\s*=\s*\{|…$)/i.test(p)).length;
  let pageType: ExtractionPageType = 'unknown';
  if (!text || text.length < 120 || normalize(text) === normalize(input.title)) reasons.push('insufficient_body');
  if (errorPage.test(text)) {pageType = 'error'; reasons.push('error_page');}
  // Repeated standalone source/date rows plus truncated snippets identify a list,
  // rather than ordinary reports mentioning several historical dates.
  if ((timestamps >= 3 && sourceLines >= 3) || (timestamps >= 2 && truncated >= 1 && sourceLines >= 2)) {
    pageType = 'listing'; reasons.push('repeated_listing_records');
  }
  if (text.length >= 120 && titleCoverage < 0.12 && normalize(input.title).length >= 8) reasons.push('title_body_coverage_low');
  if (text.length >= 120 && !paragraphCount) reasons.push('no_substantial_prose');
  if (!reasons.length) pageType = 'article';
  return {status: reasons.length ? 'review' : 'accepted', reasons, bodyChars:text.length, titleCoverage, pageType, paragraphCount, linkDensity:0};
}

const BODY_SELECTORS = [
  'article', '[itemprop="articleBody"]', '.article-content', '.article-body', '.post-content',
  '.detail-content', '#article-content', '.entry-content', '.rich_media_content', '#js_content', '.news-content',
];
const FALLBACK_SELECTORS = ['main', '#content', '#main', '.bodywrapper', '.ecb-pressContent', '.content__main', '.body__content', '#contents', '.contents', '.content', '.text'];
const SOURCE_BODY_SELECTORS:Record<string,string[]> = {
 'www.stcn.com':['.detail-content'],
 'finance.eastmoney.com':['#ContentBody'],
 'www.bea.gov':['.release-body','.field--name-body'],
 'www.eia.gov':['.tie-article'],
 'www.mofcom.gov.cn':['.art-con'],
 'www.mct.gov.cn':['#zoom','.TRS_Editor'],
 'www.miit.gov.cn':['#con_con'],
 'www.meti.go.jp':['.textArea'],
};
const REMOVE = 'script,style,nav,footer,header,aside,form,iframe,noscript,svg,.sidebar,.navigation,.breadcrumb,.breadcrumbs,.cookie-banner,.comment,.ad,[class*="recommend"],[class*="related"]';

function nodeText(node: any): string {
  const copy = node.clone();
  copy.find('br').replaceWith('\n');
  copy.find('p,h1,h2,h3,h4,h5,li,blockquote,tr').each((_: number, element: any) => {
    const target = copy.find(element); target.append('\n\n');
  });
  return clean(copy.text());
}

/** Extract one article container. Never concatenate every matching .content/.text node. */
export function extractArticleHtml(html: string, options: {url: string; expectedTitle?: string}): ArticleExtraction {
  const $ = cheerio.load(html);
  const titles = [$('meta[property="og:title"]').first().attr('content') || '', ...$('.detail-title,.article-title,h1').toArray().map(el=>$(el).text()), $('title').first().text()].map(clean).filter(Boolean);
  const expectedTitle=normalize(options.expectedTitle || '');
  const pageTitle = titles.find(title=>expectedTitle&&normalize(title).includes(expectedTitle)) || titles[0] || '';
  let host='';try{host=new URL(options.url).hostname;}catch{}
  const sourceSelectors=SOURCE_BODY_SELECTORS[host] || [];
  const canonicalHref = $('link[rel="canonical"]').first().attr('href');
  let canonicalUrl: string | null = null;
  try {if (canonicalHref) canonicalUrl = new URL(canonicalHref, options.url).href;} catch {}
  const schemaArticle = $('script[type="application/ld+json"]').toArray().some(el => /"(?:NewsArticle|Article|Report|BlogPosting)"/.test($(el).text()));
  const metaArticle = $('meta[property="og:type"]').attr('content') === 'article' || !!$('meta[property="article:published_time"]').length;
  $(REMOVE).remove();
  const candidates: Array<{text:string; selector:string; linkDensity:number; paragraphs:number; strong:boolean; listBlocks:number; headed:boolean; sourceSpecific:boolean}> = [];
  for (const selector of [...new Set([...sourceSelectors,...BODY_SELECTORS, ...FALLBACK_SELECTORS])]) {
    $(selector).each((_, element) => {
      const node = $(element), text = nodeText(node);
      if (!text) return;
      const anchorChars = node.find('a').toArray().reduce((n, el) => n + clean($(el).text()).length, 0);
      const paragraphs = node.find('p').toArray().filter(el => clean($(el).text()).length >= 30).length;
      const listBlocks = node.find('.list-item,.news-item,.article-item,[class*="ellipsis"]').length;
      candidates.push({text, selector, linkDensity:anchorChars / Math.max(1,text.length), paragraphs, strong:BODY_SELECTORS.includes(selector)||sourceSelectors.includes(selector), sourceSpecific:sourceSelectors.includes(selector), listBlocks, headed:node.find('h1,.article-title,.detail-title').length>0});
    });
  }
  const eligible = candidates.filter(c => c.text.length >= 120 && c.linkDensity < 0.35 && c.listBlocks < 3 && (c.paragraphs > 0 || c.strong));
  const scoped=sourceSelectors.map(selector=>eligible.find(c=>c.selector===selector)).filter(Boolean);
  const strong = eligible.filter(c => c.strong);
  const selected = scoped[0] || (strong.length ? strong : eligible).sort((a,b) => b.paragraphs - a.paragraphs || b.text.length - a.text.length)[0];
  if (!selected) {
    return {text:'', pageTitle, canonicalUrl, selector:null, status:'review', reasons:['no_article_container'], bodyChars:0, titleCoverage:0, pageType:errorPage.test(pageTitle) ? 'error' : 'listing', paragraphCount:0, linkDensity:1};
  }
  const audit = auditExtractedText({title:options.expectedTitle || pageTitle, raw_text:selected.text, url:options.url});
  const reasons = [...audit.reasons];
  const expected = normalize(options.expectedTitle || ''), actual = normalize(pageTitle);
  if (expected && actual && !actual.includes(expected) && !expected.includes(actual) && titleBodyCoverage(options.expectedTitle!, pageTitle) < 0.45) reasons.push('detail_title_mismatch');
  if (!selected.strong && !schemaArticle && !metaArticle && selected.paragraphs < 2 && !selected.headed) reasons.push('article_page_unconfirmed');
  if (selected.linkDensity > 0.2 && !selected.sourceSpecific) reasons.push('body_link_density_high');
  return {...audit, bodyChars:Math.min(40_000,selected.text.length), text:selected.text.slice(0,40_000), pageTitle, canonicalUrl, selector:selected.selector, paragraphCount:selected.paragraphs, linkDensity:selected.linkDensity,
    reasons:[...new Set(reasons)], status:reasons.length ? 'review' : 'accepted',
    pageType:reasons.includes('repeated_listing_records') ? 'listing' : reasons.includes('error_page') ? 'error' : 'article'};
}
