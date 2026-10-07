import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { buildPublicEdition, publicSourceUrl, matchesPublicRegion, type PublicInputArticle } from '../lib/public-edition';
import { createPublicReader } from '../lib/public-reader-ui';
import { overviewWindow } from '../lib/overview-window';

const quote='本期贷款利率传导仍需观察实际融资需求变化';
const judgment={thesis:'融资改善以需求恢复为条件',mechanism:'融资成本向企业传导仍有时滞',evidence:quote,direction:'bullish',asset:'企业融资敏感资产',conditions:'融资成本实际下降且需求企稳时',counterpoint:'需求疲弱可能抵消融资改善',watch:'贷款需求与实际融资成本',horizon:'short'};
function row(id:number,extra:Partial<PublicInputArticle>={}):PublicInputArticle{
 const title=extra.title||'中国央行政策 '+id;
 return {id,title,url:'https://example.org/news/'+id,publisher:'官方发布',source_tier:'official',source_type:'crawled',raw_text:title+'。'+quote+'。发布记录区分本期材料中的政策信息与市场推论，原文说明融资成本传导仍需实际需求恢复，并需要后续核对。企业经营数据、产业变化与统计发布中的条件应分别考察，不能仅从一次新闻推断持续的盈利改善或资产价格走势。\n\nRAW_BODY_DO_NOT_EXPORT',summary:'公开摘要 '+id,published_at:'2026-09-26',fetched_at:'2026-09-26T01:00:00Z',judgment:JSON.stringify({...judgment,note:'PRIVATE_JUDGMENT_EXTRA'}),...extra};
}
test('公开白名单排除手动资料、私有 URL 与判断附加字段；只保留可核对引用',()=>{
 const edition=buildPublicEdition([row(1),row(2,{source_type:'staged',title:'PRIVATE_IMPORTED_TITLE'}),row(3,{url:'http://127.0.0.1/private'}),row(4,{judgment:JSON.stringify({...judgment,evidence:'原文中不存在的完整引用内容'})})],[{date:'2026-09-26',article_ids:'[1,2,3,4]',generated_at:'2026-09-26'},{date:'2026-02-30',article_ids:'[1]',generated_at:'2026-09-26'}],'2026-09-26T02:00:00Z');
 assert.deepEqual(edition.articles.map(a=>a.id),[4,1]);
 assert.deepEqual(edition.issues[0].articleIds,[1,4]);
 assert.equal(edition.issues.length,1);
 assert.equal(edition.articles.find(a=>a.id===1)?.judgment?.direction,'bullish');
 assert.equal(edition.articles.find(a=>a.id===1)?.judgment?.asset,'企业融资敏感资产');
 assert.equal(edition.articles.find(a=>a.id===1)?.judgment?.conditions,'融资成本实际下降且需求企稳时');
 assert.equal(edition.articles.find(a=>a.id===4)?.judgment,null);
 const serialized=JSON.stringify(edition);
 for(const secret of ['raw_text','source_type','PRIVATE_IMPORTED_TITLE','PRIVATE_JUDGMENT_EXTRA','RAW_BODY_DO_NOT_EXPORT'])assert.ok(!serialized.includes(secret),secret);
 assert.equal(buildPublicEdition([row(8,{published_at:'2026-02-30'})],[]).articles[0].publishedAt,null);
});
test('公开原文 URL 不允许本机、私网、凭证或脚本协议',()=>{
 for(const url of ['javascript:alert(1)','file:///C:/private','http://localhost/x','https://user:password@example.org/x','http://192.168.1.2/x','http://172.16.1.1/x','http://[fc00::1]/x','http://[fe80::1]/x','https://example.org/x?api_key=secret','http://2130706433/x','http://localhost./x','http://example.local./x','http://intranet/x','http://[::127.0.0.1]/x','https://example.org/x?sig=secret','https://example.org/x?X-Goog-Credential=secret','https://example.org/x?X-Goog-Signature=secret'])assert.equal(publicSourceUrl(url),null,url);
 assert.equal(publicSourceUrl('https://example.org/news?q=macro#section'),'https://example.org/news?q=macro');
 assert.equal(publicSourceUrl('https://example.org./news'),'https://example.org/news');
});
test('首页只按原始发布日期选择窗口，抓取今天的旧文章不变成今日新闻',()=>{
 const edition=buildPublicEdition([row(1,{published_at:'2026-09-10'}),row(2,{published_at:'2026-09-26'}),row(3,{published_at:null})],[],'2026-09-26T02:00:00Z');
 const window=overviewWindow(edition.articles.map(a=>({...a,published_at:a.publishedAt,latest_at:a.publishedAt||''})),Date.parse(edition.snapshotAt));
 assert.deepEqual(window.items.map(a=>a.id),[2]);assert.equal(window.label,'今日发布');
});
test('单期背景观察即使写了条件，也不会占用首页的条件判断重点',()=>{
 const edition=buildPublicEdition([row(8,{judgment:JSON.stringify({...judgment,horizon:'knowledge',direction:'neutral'})})],[],'2026-09-26T02:00:00Z');
 const html=createPublicReader(edition,'').home();
 assert.equal((html.match(/class="key-change"/g)||[]).length,0);
 assert.ok(html.includes('同期材料线索'));
});
test('静态导出不读历史私有日报正文，公开导航全部落地且不包含数据库、笔记或 raw body',()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'finance-public-export-')),database=path.join(fixture,'fixture.db'),out=path.join(fixture,'site');
 const db=new DatabaseSync(database);
 db.exec(fs.readFileSync(path.join(process.cwd(),'data/schema.sql'),'utf8'));
 db.exec(fs.readFileSync(path.join(process.cwd(),'data/stories.sql'),'utf8'));
 for(const a of [row(1,{title:'中国央行政策 <script>alert(1)</script>'}),row(2,{title:'PRIVATE_IMPORTED_TITLE',source_type:'staged',summary:'PRIVATE_IMPORTED_SUMMARY'}),row(3,{url:'javascript:alert(1)',title:'PRIVATE_INVALID_URL'}),row(4,{title:'人工智能商业落地',publisher:'公开媒体',source_tier:'media',judgment:null}),row(5,{title:'半导体生产线扩产',publisher:'公开媒体',source_tier:'media',judgment:null}),row(6,{title:'市场行情评论',publisher:'公开媒体',source_tier:'media',judgment:null})]){
  db.prepare('INSERT INTO articles(id,title,url,publisher,source_tier,source_type,raw_text,published_at,fetched_at) VALUES(?,?,?,?,?,?,?,?,?)').run(a.id,a.title,a.url,a.publisher!,a.source_tier!,a.source_type,a.raw_text!,a.published_at!,a.fetched_at);
  db.prepare('INSERT INTO summaries(article_id,summary,tags) VALUES(?,?,?)').run(a.id,a.summary!,'[]');
  if(a.judgment)db.prepare('INSERT INTO article_judgments(article_id,content,generated_at) VALUES(?,?,?)').run(a.id,a.judgment,'2026-09-26T01:00:00Z');
 }
 db.prepare('INSERT INTO digests(date,article_ids,full_content_md,generated_at) VALUES(?,?,?,?)').run('2026-09-26','[1,2,3,4,5,6]','PRIVATE_FROZEN_DIGEST_MARKDOWN','2026-09-26T02:00:00Z');
 db.prepare('INSERT INTO digests(date,article_ids,full_content_md,generated_at) VALUES(?,?,?,?)').run('2026-09-25','[2]','PRIVATE_ONLY_ISSUE','2026-09-25T02:00:00Z');
 db.prepare('INSERT INTO research_notes(article_id,note,created_at,updated_at) VALUES(?,?,?,?)').run(1,'PRIVATE_RESEARCH_NOTE','2026-09-26','2026-09-26');
 db.close();
 const result=execFileSync(process.execPath,['--import','tsx','scripts/export-reader-public.ts','--db='+database,'--out='+out,'--site-url=https://example.org'],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(JSON.parse(result).articles,4);
 const publicData=JSON.parse(fs.readFileSync(path.join(out,'assets/public-data.json'),'utf8'));
 for(const [sector,href] of [['macro','/macro/'],['semiconductor','/industry/?sector=semiconductor'],['general','/search/?sector=general']]){
  const event=publicData.events.find((item:{sector:string})=>item.sector===sector);
  assert.ok(event,'fixture missing '+sector);
  assert.ok(fs.readFileSync(path.join(out,'events',event.id,'index.html'),'utf8').includes('href="'+href+'">返回分类'),sector+' navigation lost');
 }
 function files(directory:string):string[]{return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
 const generated=files(out),all=generated.map(file=>fs.readFileSync(file,'utf8')).join('\n');
 for(const secret of ['PRIVATE_IMPORTED_TITLE','PRIVATE_IMPORTED_SUMMARY','PRIVATE_INVALID_URL','PRIVATE_FROZEN_DIGEST_MARKDOWN','PRIVATE_ONLY_ISSUE','PRIVATE_RESEARCH_NOTE','PRIVATE_JUDGMENT_EXTRA','RAW_BODY_DO_NOT_EXPORT'])assert.ok(!all.includes(secret),secret);
 assert.ok(!generated.some(file=>/\.(?:db|sqlite|env)$/.test(file)));
 assert.ok(fs.existsSync(path.join(out,'articles/1/index.html')));
 const home=fs.readFileSync(path.join(out,'index.html'),'utf8');
 assert.equal((home.match(/class="key-change"/g)||[]).length,1);
 assert.ok(home.includes('融资改善以需求恢复为条件'));
 assert.ok(fs.readFileSync(path.join(out,'articles/1/index.html'),'utf8').includes('<link rel="canonical" href="https://example.org/articles/1/">'));
 assert.ok(fs.readFileSync(path.join(out,'articles/1/index.html'),'utf8').includes('<meta name="robots" content="noindex,follow">'));
 assert.ok(!fs.readFileSync(path.join(out,'index.html'),'utf8').includes('content="noindex,follow"'));
 assert.ok(fs.readFileSync(path.join(out,'robots.txt'),'utf8').includes('Sitemap: https://example.org/sitemap.xml'));
 const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8');
 assert.ok(sitemap.includes('<loc>https://example.org/about/</loc>'));
 assert.ok(!sitemap.includes('/articles/1/'));
 assert.ok(!sitemap.includes('/articles/2/'));
 assert.ok(!fs.existsSync(path.join(out,'articles/2/index.html')));
 assert.ok(!fs.existsSync(path.join(out,'daily/2026-09-25/index.html')));
 for(const file of generated.filter(file=>file.endsWith('.html'))){
  const content=fs.readFileSync(file,'utf8');
  assert.ok(!content.includes('<script>alert(1)</script>'));
  for(const match of content.matchAll(/(?:href|src)="(\/[^"]*)"/g)){
   const relative=match[1].split(/[?#]/)[0],target=path.join(out,relative.replace(/^\//,''));
   assert.ok(fs.existsSync(relative.endsWith('/')?path.join(target,'index.html'):target),'Broken '+relative+' in '+file);
  }
 }
 assert.ok(all.includes('反向检验'));assert.ok(all.includes('继续跟踪'));
 assert.ok(!all.includes('发布 2026/09/26 08:00'));
 assert.ok(all.includes('条件偏多'));assert.ok(all.includes('企业融资敏感资产'));assert.ok(all.includes('融资成本实际下降且需求企稳时'));
 const badOut=path.join(fixture,'wrong-source');
 assert.throws(()=>execFileSync(process.execPath,['--import','tsx','scripts/export-reader-public.ts','--db='+database,'--out='+badOut,'--site-url=https://example.org','--expected-db-sha256='+'0'.repeat(64)],{cwd:process.cwd(),stdio:'pipe'}),/源数据库 SHA-256 与预期不符/);
 assert.ok(!fs.existsSync(badOut));
 assert.throws(()=>execFileSync(process.execPath,['--import','tsx','scripts/export-reader-public.ts','--db='+database,'--out='+out,'--site-url=https://example.org'],{cwd:process.cwd(),stdio:'pipe'}),/输出目录非空/);
});

test('地区范围保持本地语义：产业全球包括中国，宏观全球聚合非中国', () => {
 assert.equal(matchesPublicRegion('industry','global','china'),true);
 assert.equal(matchesPublicRegion('industry','global','us'),true);
 assert.equal(matchesPublicRegion('industry','us','china'),false);
 assert.equal(matchesPublicRegion('macro','global','china'),false);
 for(const region of ['us','europe','japan','global'])assert.equal(matchesPublicRegion('macro','global',region),true);
});

test('官方站转载来源带空白时正确标识，并保留英文原始标题与中文主题标题',()=>{
 const title='Central bank policy update',base=row(70,{title}).raw_text!;
 const fixtures=[
  row(70,{title,title_zh:'央行政策更新',raw_text:base,judgment:null}),
  row(71,{title,title_zh:'央行政策更新',raw_text:'来源：  新华网\n'+base,judgment:null}),
  row(72,{title,title_zh:'央行政策更新',raw_text:'来源：\n Reuters\n'+base,judgment:null}),
  row(73,{title,title_zh:'央行政策更新',raw_text:'新华社发布材料\n'+base,judgment:null}),
  row(74,{title,title_zh:'央行政策更新',raw_text:'来源：Reuters\n'+base,source_tier:'media',judgment:null}),
 ];
 const edition=buildPublicEdition(fixtures,[]);
 assert.equal(edition.articles.length,5);
 const byId=new Map(edition.articles.map(article=>[article.id,article]));
 assert.equal(byId.get(70)?.sourceRole,'官方发布');
 for(const id of [71,72,73])assert.equal(byId.get(id)?.sourceRole,'官方网站转载');
 assert.equal(byId.get(74)?.sourceRole,'媒体转述');
 for(const article of edition.articles){assert.equal(article.originalTitle,title);assert.equal(article.title,'央行政策更新');}
});
