import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {assessContentQuality,QUALITY_RULE_VERSION} from '../lib/content-quality';
import {groupEventArticles} from '../lib/event-grouping';
const apply=process.argv.includes('--apply'),out=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'outputs/quality-upgrade-20260926/audit');
fs.mkdirSync(out,{recursive:true});const database=path.resolve(process.argv.find(a=>a.startsWith('--db='))?.slice(5)||'data/invest.db');const db=new DatabaseSync(database,{readOnly:!apply});
if(apply)db.exec(fs.readFileSync('data/schema.sql','utf8'));
const hasBasis=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name='generation_basis'").get());
const rows=db.prepare("SELECT a.*,s.summary,s.tags,j.content judgment,tr.title_zh,"+(hasBasis?"b.source_fingerprint,b.basis_kind":"NULL source_fingerprint,NULL basis_kind")+" FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id "+(hasBasis?"LEFT JOIN generation_basis b ON b.article_id=a.id ":"")+"WHERE a.source_type='crawled' ORDER BY a.id").all() as any[];
const inspected=rows.map(row=>({row,quality:assessContentQuality(row)})),accepted=inspected.filter(x=>x.quality.status==='accepted'),review=inspected.filter(x=>x.quality.status==='review');
const grouping=groupEventArticles(accepted.map(x=>x.row)),checkedAt=new Date().toISOString();
if(apply){db.exec('BEGIN IMMEDIATE');try{for(const {row,quality} of inspected){
 db.prepare('INSERT INTO quality_review(article_id,status,reasons,source_fingerprint,checked_at,rule_version) VALUES(?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET status=excluded.status,reasons=excluded.reasons,source_fingerprint=excluded.source_fingerprint,checked_at=excluded.checked_at,rule_version=excluded.rule_version').run(row.id,quality.status,JSON.stringify(quality.reasons),quality.fingerprint,checkedAt,QUALITY_RULE_VERSION);
 // Legacy outputs have unknown original prompt/model. This records today's automated audit basis honestly.
 if(quality.status==='accepted'&&row.summary&&!row.source_fingerprint)db.prepare("INSERT OR IGNORE INTO generation_basis(article_id,source_fingerprint,model,prompt_version,generated_at,basis_kind) VALUES(?,?,NULL,NULL,?,'legacy_audited')").run(row.id,quality.fingerprint,checkedAt);
}
for(const group of grouping.groups)for(const id of group.articleIds)db.prepare('INSERT INTO public_event_links(article_id,event_id,association_status,basis,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET event_id=excluded.event_id,association_status=excluded.association_status,basis=excluded.basis,checked_at=excluded.checked_at').run(id,group.id,'confirmed',group.articleIds.length>1?'publication_period_and_body_agreement':'single_material',checkedAt);
db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
const reasons:Record<string,number>={};for(const item of review)for(const reason of item.quality.reasons)reasons[reason]=(reasons[reason]||0)+1;
const result={checkedAt,applied:apply,totalCrawled:rows.length,accepted:accepted.length,quarantined:review.length,withSummary:accepted.filter(x=>x.row.summary).length,withJudgment:accepted.filter(x=>x.row.judgment).length,reasons,eventGrouping:grouping.counts,quarantine:review.map(({row,quality})=>({id:row.id,title:row.title,url:row.url,publisher:row.publisher,reasons:quality.reasons,bodyChars:quality.bodyChars,summaryCoverage:quality.summaryCoverage})),eventReviewPairs:grouping.reviewPairs,mergedGroups:grouping.groups.filter(g=>g.articleIds.length>1)};
fs.writeFileSync(path.join(out,'content-audit.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'review-queue.md'),'# 公开发布复核队列\n\n仅内部使用；这些原始材料仍保存在数据库。自动门槛不能证明事实真实。\n\n'+result.quarantine.map(a=>'- '+a.id+' ['+a.title.replace(/\]/g,'')+']('+a.url+') · '+a.publisher+' · '+a.reasons.join(', ')).join('\n'));
console.log(JSON.stringify({...result,quarantine:undefined,eventReviewPairs:undefined,mergedGroups:undefined}));db.close();
