/** Static public snapshot: read-only SQLite, quality gate, explicit field allowlist. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {buildPublicEdition,type PublicInputArticle,type PublicInputDigest} from '../lib/public-edition';
import {createPublicReader,escapeHtml} from '../lib/public-reader-ui';
import {publicReaderClientScript} from '../lib/public-reader-client';
const arg=(name:string)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const dbArg=arg('db'),outArg=arg('out'),siteArg=arg('site-url');
if(!dbArg||!outArg||!siteArg)throw Error('公开导出必须显式指定 --db、--out 和 --site-url，避免误用默认原库或站点地址。');
const repo=process.cwd(),out=path.resolve(outArg),database=path.resolve(dbArg);
const site=new URL(siteArg);
if(site.protocol!=='https:'||site.username||site.password||site.search||site.hash||site.pathname!=='/')throw Error('--site-url 必须是 HTTPS 站点根地址。');
const siteOrigin=site.origin;
const snapshotArg=arg('snapshot-at');
if(snapshotArg&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(snapshotArg)||!Number.isFinite(Date.parse(snapshotArg))))throw Error('--snapshot-at 必须是带时区的 ISO 时间，不接受本机区域日期格式。');
const snapshotAt=snapshotArg?new Date(snapshotArg).toISOString():new Date().toISOString();
const sourceHash=()=>createHash('sha256').update(fs.readFileSync(database)).digest('hex');
if(fs.existsSync(database+'-wal')&&fs.statSync(database+'-wal').size)throw Error('源数据库存在未归档 WAL；请先制作一致的只读快照再导出。');
const sourceDbSha256=sourceHash(),expectedHash=arg('expected-db-sha256');
if(expectedHash&&sourceDbSha256!==expectedHash.toLowerCase())throw Error('源数据库 SHA-256 与预期不符；已停止导出。');
for(const reserved of [repo,path.join(repo,'data'),path.join(repo,'.git'),path.join(repo,'node_modules')])if(out===reserved||(reserved!==repo&&out.startsWith(reserved+path.sep)))throw Error('拒绝导出到项目或私有数据目录。');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('输出目录非空；请指定新的 --out= 目录，避免混入旧文件。');
const db=new DatabaseSync(database,{readOnly:true});let rows:PublicInputArticle[],digests:PublicInputDigest[];
try{
 const hasBasis=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name='generation_basis'").get());
 rows=db.prepare("SELECT a.id,a.title,a.url,a.canonical_url,a.publisher,a.published_at,a.fetched_at,a.source_tier,a.is_primary,a.source_type,a.raw_text,a.raw_html,s.summary,s.tags,s.generated_at summary_generated_at,tr.title_zh,j.content judgment,"+(hasBasis?"b.source_fingerprint,b.basis_kind,b.generated_at generation_at":"NULL source_fingerprint,NULL basis_kind,NULL generation_at")+" FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id "+(hasBasis?"LEFT JOIN generation_basis b ON b.article_id=a.id ":"")+"WHERE a.source_type='crawled' ORDER BY a.id DESC").all() as PublicInputArticle[];
 digests=db.prepare('SELECT date,article_ids,generated_at FROM digests ORDER BY date DESC').all() as PublicInputDigest[];
}finally{db.close();}
if(sourceHash()!==sourceDbSha256)throw Error('导出期间源数据库发生变化；已停止导出。');
const edition=buildPublicEdition(rows,digests,snapshotAt);
if(!edition.articles.length)throw Error('没有通过质量检查的公开材料；拒绝生成空站。');
function write(relative:string,content:string){const f=path.join(out,relative);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,content,'utf8');}
const logoAsset='cutout-4-faa830732ac5.webp',logoSource=path.join(repo,'public/reader',logoAsset);
const logo=fs.existsSync(logoSource)?'<img src="/reader/'+logoAsset+'" alt="" width="32" height="34">':'✳';
if(fs.existsSync(logoSource)){fs.mkdirSync(path.join(out,'reader'),{recursive:true});fs.copyFileSync(logoSource,path.join(out,'reader',logoAsset));}
const ui=createPublicReader(edition,logo,siteOrigin);
write('index.html',ui.home());
for(const kind of ['macro','industry','search'] as const)write(kind+'/index.html',ui.filterPage(kind));
if(edition.issues.length){write('daily/index.html',ui.shell('财经日报','daily',ui.issueBody(edition.issues[0]),'','/daily/'));for(const issue of edition.issues){const html=ui.shell(issue.date+' 财经日报','daily',ui.issueBody(issue),'','/daily/'+issue.date+'/');for(const base of ['daily','digest','share'])write(base+'/'+issue.date+'/index.html',html);}}
else write('daily/index.html',ui.shell('财经日报','daily','<main class="single-page">'+ui.empty('暂无符合公开门槛的日报。')+'</main>','','/daily/'));
for(const a of edition.articles)write('articles/'+a.id+'/index.html',ui.shell(a.title,a.sector==='macro'?'macro':'industry',ui.articleBody(a),'','/articles/'+a.id+'/'));
for(const e of edition.events)write('events/'+e.id+'/index.html',ui.shell(e.title,e.sector==='macro'?'macro':'industry',ui.eventBody(e),'','/events/'+e.id+'/'));
// Preserve already shared material and event URLs without republishing failed content.
const publicIds=new Set(edition.articles.map(a=>a.id)),eventIds=new Set(edition.events.map(e=>e.id));
for(const row of rows)if(Number.isSafeInteger(row.id)&&row.id>0&&!publicIds.has(row.id))write('articles/'+row.id+'/index.html',ui.shell('材料待核对','',ui.review()));
for(const a of edition.articles)if(a.oldEventId!==a.eventId&&!eventIds.has(a.oldEventId))write('events/'+a.oldEventId+'/index.html',ui.shell('事件已归并','','<main class="single-page"><h1>事件已归并</h1><p>同一事实的来源已集中到一个事件页。</p><a class="text-link" href="/events/'+escapeHtml(a.eventId)+'/">阅读归并事件 →</a></main>'));
const crawledIds=new Set(rows.map(r=>r.id));
const hasCrawledMaterial=(value:string|null)=>{try{const ids:unknown=JSON.parse(value||'[]');return Array.isArray(ids)&&ids.some(id=>typeof id==='number'&&crawledIds.has(id));}catch{return false;}};
for(const d of digests)if(/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&hasCrawledMaterial(d.article_ids)&&!edition.issues.some(i=>i.date===d.date))for(const base of ['daily','digest','share'])write(base+'/'+d.date+'/index.html',ui.shell('本期材料待核对','daily',ui.review()));
write('about/index.html',ui.shell('阅读与更新说明','about',ui.about(),'','/about/'));
write('settings/index.html',ui.shell('阅读设置','about',ui.settings(),'','/settings/'));
write('404.html',ui.shell('页面不存在','','<main class="single-page"><h1>页面不存在</h1><p>本期公开快照没有该页面。</p><a href="/" class="text-link">返回今日总览 →</a></main>'));
const searchIndex={snapshotAt:edition.snapshotAt,contentUpdatedAt:edition.contentUpdatedAt,articles:edition.articles.map(a=>({id:a.id,title:a.title,originalTitle:a.originalTitle,topicLabel:a.topicLabel,summary:a.summary||a.factExcerpt,summaryKind:a.summary?'model':'source_excerpt',publisher:a.publisher,sourceTier:a.sourceTier,sourceRole:a.sourceRole,publishedAt:a.publishedAt,region:a.region,sector:a.sector,theme:a.theme,eventId:a.eventId})),events:edition.events,issues:edition.issues};
write('assets/public-data.json',JSON.stringify(searchIndex));
// Allowlisted published baseline for the independently scheduled public reader.
write('assets/edition-seed.json',JSON.stringify(edition));
write('assets/reader.js',publicReaderClientScript());
write('assets/filter-init.js',"(function(){if(location.search&&/^\\/(?:search|macro|industry)\\//.test(location.pathname))document.documentElement.dataset.filterPending='true';try{var p=JSON.parse(localStorage.getItem('finance-public-reading-preferences')||localStorage.getItem('finance:reading')||localStorage.getItem('finance-reading-preferences')||'{}');if(['light','dark','system'].includes(p.theme))document.documentElement.dataset.theme=p.theme;if(p.size==='large')document.documentElement.dataset.textSize='large';if(p.width==='wide')document.documentElement.dataset.readingWidth='wide';}catch(e){}})();");
write('assets/reader.css',fs.readFileSync('app/reader-tokens.css','utf8')+'\n'+fs.readFileSync('public/reader/public-reader.css','utf8')+'\n'+fs.readFileSync('app/reading-refinements.css','utf8'));
write('_headers',["/*","  X-Content-Type-Options: nosniff","  Referrer-Policy: strict-origin-when-cross-origin","  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'","  Cache-Control: public, max-age=0, must-revalidate","/reader/*","  Cache-Control: public, max-age=31536000, immutable",""].join('\n'));
// Content-level reuse rights are still pending review. Keep the discovery file limited to site-owned entry pages.
const paths=['/','/about/'];
write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+paths.map(p=>'  <url><loc>'+escapeHtml(siteOrigin+p)+'</loc></url>').join('\n')+'\n</urlset>\n');
write('robots.txt','User-agent: *\nAllow: /\nSitemap: '+siteOrigin+'/sitemap.xml\n');
console.log(JSON.stringify({output:out,siteOrigin,snapshotAt:edition.snapshotAt,sourceDbSha256,articles:edition.articles.length,events:edition.events.length,issues:edition.issues.length,quarantined:rows.length-edition.articles.length}));
