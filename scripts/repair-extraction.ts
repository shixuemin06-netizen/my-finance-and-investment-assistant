import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fetchArticleText} from '../crawlers/website';
import {auditExtractedText} from '../lib/extraction-quality';
import {contentFingerprint} from '../lib/content-fingerprint';
const args=process.argv.slice(2);
const value=(name:string)=>args.find(arg=>arg.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const apply=args.includes('--apply'),all=args.includes('--all');
const database=path.resolve(value('db')||path.join(process.env.FINANCE_DATA_DIR||'data','invest.db'));
if(apply){const relative=path.relative(path.resolve('outputs'),database);if(!value('db')||relative.startsWith('..')||path.isAbsolute(relative)||database===path.resolve('data/invest.db'))throw Error('Apply is restricted to an explicitly named disposable database under outputs; the original database remains unchanged');}
const limit=Math.min(1000,Math.max(1,Number(value('limit')||40)));
const publisher=value('publisher');
const reportPath=path.resolve(value('report')||'outputs/content-quality-20260926/extraction-repair.json');
const read=new DatabaseSync(database,{readOnly:true});
const rows=read.prepare("SELECT a.* FROM articles a LEFT JOIN sources s ON s.id=a.source_id WHERE a.source_type='crawled' AND (a.source_tier='media' OR s.source_key LIKE 'web:%') ORDER BY a.id DESC").all() as Array<any>;
const selected=rows.filter(row=>(!publisher||row.publisher===publisher)&&! /\.(pdf|xlsx?|docx?|zip|png|jpe?g)(?:[?#]|$)/i.test(row.url)&&
  (auditExtractedText(row).status==='review'||(all&&!row.raw_html))).slice(0,limit);
read.close();
const changes:Array<any>=value('apply-report') ? JSON.parse(fs.readFileSync(path.resolve(value('apply-report')!),'utf8')).changes : [];
const pending=value('apply-report') ? [] : selected;
let next=0;
async function prepareWorker(){
 while(next<pending.length){
  const row=pending[next++];
  const result=await fetchArticleText(row.url,row.title);
  const accepted=result.quality?.status==='accepted';
  changes.push({id:row.id,title:row.title,publisher:row.publisher,url:row.url,previousFingerprint:contentFingerprint(row),
   previousReasons:auditExtractedText(row).reasons,status:accepted?'correctable':'review',reasons:result.quality?.reasons||['fetch_failed'],
   bodyChars:result.text.length,selector:result.quality?.selector||null,originalPublishedAt:row.published_at,
   observedPublishedAt:result.publishedAt,rawText:accepted?result.text:null,rawHtml:accepted?result.rawHtml:null,
   observedHtml:result.rawHtml,quality:result.quality,bodyChanged:accepted&&row.raw_text!==result.text});
  console.log(JSON.stringify({id:row.id,status:accepted?'correctable':'review',bodyChars:result.text.length,reasons:result.quality?.reasons||['fetch_failed']}));
 }
}
await Promise.all(Array.from({length:4},()=>prepareWorker()));
changes.sort((a,b)=>b.id-a.id);
let corrected=0,generationInvalidated=0,dateCorrected=0,observationReviews=0;
if(apply){
 // Open the write connection only after preparation and create a consistent backup.
 const backup=path.resolve(value('backup')||'outputs/content-quality-20260926/before-extraction-repair.sqlite');
 if(fs.existsSync(backup))throw Error('Backup already exists; choose a fresh --backup path');
 fs.mkdirSync(path.dirname(backup),{recursive:true});
 const write=new DatabaseSync(database);write.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");
 write.close();
 process.env.FINANCE_DATA_DIR=path.dirname(database);
 const {default:db}=await import('../lib/db');
 const {archiveAndInvalidateGeneration,recordContentQuality}=await import('../lib/generation-provenance');
 const {assessContentQuality}=await import('../lib/content-quality');
 db.exec('CREATE TABLE IF NOT EXISTS article_content_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT,article_id INTEGER NOT NULL,raw_text TEXT,raw_html TEXT,content_hash TEXT,published_at TEXT,reason TEXT NOT NULL,archived_at TEXT NOT NULL)');
 for(const change of changes.filter(item=>item.status==='correctable'||item.observedHtml)){
  db.transaction(()=>{
   const current=db.prepare('SELECT * FROM articles WHERE id=?').get(change.id);
   if(!current||contentFingerprint(current as any)!==change.previousFingerprint)throw Error('Source changed during repair: '+change.id);
   const observedQuality=change.quality;
   if(change.status==='review'){
    db.prepare('UPDATE articles SET raw_html=? WHERE id=?').run(change.observedHtml,current.id);
    recordContentQuality(current.id,{status:'review',reasons:change.reasons.map((reason:string)=>'observed_'+reason),fingerprint:contentFingerprint(current as any)});
    observationReviews++;
   }else if(change.bodyChanged||(change.observedPublishedAt&&change.observedPublishedAt!==current.published_at)){
    db.prepare('INSERT INTO article_content_revisions(article_id,raw_text,raw_html,content_hash,published_at,reason,archived_at) VALUES(?,?,?,?,?,?,?)').run(current.id,current.raw_text,current.raw_html,current.content_hash,current.published_at,'single_container_reextraction',new Date().toISOString());
    if(archiveAndInvalidateGeneration(current as any,'extraction_basis_changed'))generationInvalidated++;
   }
   if(change.status==='correctable'){
   const hash=crypto.createHash('md5').update(current.title+'\n'+change.rawText).digest('hex');
   // Publication time comes from the source page, never the repair clock.
   const published=change.observedPublishedAt||current.published_at;
   if(published!==current.published_at)dateCorrected++;
   db.prepare('UPDATE articles SET raw_text=?,raw_html=?,content_hash=?,published_at=? WHERE id=?').run(change.rawText,change.rawHtml,hash,published,current.id);
   }
   const quality=observedQuality;
   if(quality)db.prepare('INSERT INTO content_extractions(article_id,source_url,page_title,page_type,selector,body_chars,paragraph_count,link_density,title_coverage,extracted_at,rule_version) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET source_url=excluded.source_url,page_title=excluded.page_title,page_type=excluded.page_type,selector=excluded.selector,body_chars=excluded.body_chars,paragraph_count=excluded.paragraph_count,link_density=excluded.link_density,title_coverage=excluded.title_coverage,extracted_at=excluded.extracted_at,rule_version=excluded.rule_version').run(current.id,current.url,quality.pageTitle,quality.pageType,quality.selector,quality.bodyChars,quality.paragraphCount,quality.linkDensity,quality.titleCoverage,new Date().toISOString(),'single-container-v1');
   if(change.status==='correctable')recordContentQuality(current.id,assessContentQuality({...current,raw_text:change.rawText,raw_html:change.rawHtml,published_at:change.observedPublishedAt||current.published_at} as any));
   if(change.bodyChanged)corrected++;
  });
 }
}
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify({generatedAt:new Date().toISOString(),mode:apply?'apply':'dry-run',candidateCount:changes.length,corrected,generationInvalidated,dateCorrected,observationReviews,correctable:changes.filter(item=>item.status==='correctable').length,review:changes.filter(item=>item.status==='review').length,changes},null,2));
console.log(JSON.stringify({reportPath,candidateCount:changes.length,corrected,generationInvalidated,dateCorrected,observationReviews,mode:apply?'apply':'dry-run'}));
