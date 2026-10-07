import { createHash } from 'node:crypto';
import db from './db';
import {overviewWindow} from './overview-window';
import { currentUserContext } from './capabilities';
import { classifyArticle,eventKey,publicationTime,storyId,type StoryArticle } from './story-classification';
export {regions,sectors,themes} from './story-classification';
export type Story={id:string;title:string;region:string;sector:string;theme:string;latest_at:string;first_at:string;representative_article_id:number;summary:string|null;publisher:string;url:string;source_tier:string;is_primary:number;published_at:string|null;fetched_at:string;report_count:number;followed:number;saved:number;note:string;last_read_update:number;revision:number;unread:number;title_zh:string|null};
const select="SELECT st.*,COALESCE(tr.title_zh,st.title) title,s.summary,a.publisher,a.url,a.source_tier,a.is_primary,a.published_at,a.fetched_at,tr.title_zh, (SELECT count(*) FROM story_articles sa WHERE sa.story_id=st.id) report_count,COALESCE(u.followed,0) followed,COALESCE(u.saved,0) saved,COALESCE(u.note,'') note,COALESCE(u.last_read_update,0) last_read_update,COALESCE((SELECT max(id) FROM story_updates su WHERE su.story_id=st.id),0) revision,(SELECT count(*) FROM story_updates su WHERE su.story_id=st.id AND su.id>COALESCE(u.last_read_update,0)) unread FROM stories st JOIN articles a ON a.id=st.representative_article_id LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN story_state u ON u.story_id=st.id AND u.profile_id='local'";
/** Called from mutation jobs only; pages never re-index or write research records. */
export function syncStories(ids?:number[]){
 if(ids&&!ids.length)return 0;
 const rows=db.prepare("SELECT a.*,s.summary,s.tags,tr.title_zh FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id "+(ids?'WHERE a.id IN ('+ids.map(()=>'?').join(',')+')':'')+' ORDER BY a.id').all(...(ids||[])) as StoryArticle[];
 let added=0;
 db.transaction(()=>{
  for(const a of rows){
   const existing=db.prepare('SELECT story_id FROM story_articles WHERE article_id=?').get(a.id);
   const key=eventKey(a),id=existing?.story_id||storyId(key),now=new Date().toISOString(),at=publicationTime(a),c=classifyArticle(a);
   const before=db.prepare('SELECT * FROM stories WHERE id=?').get(id);
   if(!before)db.prepare('INSERT INTO stories(id,event_key,title,region,sector,theme,representative_article_id,first_at,latest_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,key,a.title,c.region,c.sector,c.theme,a.id,at,at,now,now);
   added+=db.prepare('INSERT OR IGNORE INTO story_articles(article_id,story_id,added_at) VALUES(?,?,?)').run(a.id,id,a.fetched_at).changes;
   const fingerprint=createHash('sha256').update(a.title+'\n'+(a.summary||'')+'\n'+(a.title_zh||'')).digest('hex');
   const last=db.prepare('SELECT fingerprint FROM story_updates WHERE story_id=? AND article_id=? ORDER BY id DESC LIMIT 1').get(id,a.id);
   if(last?.fingerprint!==fingerprint){
    db.prepare('INSERT OR IGNORE INTO story_updates(story_id,article_id,fingerprint,kind,created_at) VALUES(?,?,?,?,?)').run(id,a.id,fingerprint,last?'summary':'report',last?now:a.fetched_at);
    db.prepare('UPDATE stories SET updated_at=? WHERE id=?').run(now,id);
   }
   if(before){
    const rep=db.prepare('SELECT source_tier,is_primary FROM articles WHERE id=?').get(before.representative_article_id);
    if(before.representative_article_id===a.id || (a.source_tier==='official'&&a.is_primary&&!(rep?.source_tier==='official'&&rep?.is_primary)))
     db.prepare('UPDATE stories SET representative_article_id=?,title=?,region=?,sector=?,theme=? WHERE id=?').run(a.id,a.title,c.region,c.sector,c.theme,id);
    db.prepare('UPDATE stories SET first_at=min(first_at,?),latest_at=max(latest_at,?) WHERE id=?').run(at,at,id);
   }
  }
 });return added;
}
export type StoryQuery={q?:string;region?:string;sector?:string;theme?:string;state?:string;tab?:string;page?:string;limit?:number;date?:string};
export function queryStories(q:StoryQuery={}){
 q=Object.fromEntries(Object.entries(q).map(([key,value])=>[key,Array.isArray(value)?value[0]:value]));
 const where:string[]=[],args:(string|number)[]=[];
 for(const k of ['region','sector','theme'] as const)if(q[k]){if(k==='region'&&q[k]==='global'){where.push("st.region!='china'");}else{where.push('st.'+k+'=?');args.push(q[k]!);}}
 if(q.q?.trim()){where.push("instr(lower(st.title||' '||COALESCE(tr.title_zh,'')||' '||COALESCE(s.summary,'')||' '||COALESCE(a.publisher,'')||' '||COALESCE(u.note,'')||' '||COALESCE((SELECT group_concat(n.note,' ') FROM research_notes n JOIN story_articles ns ON ns.article_id=n.article_id WHERE ns.story_id=st.id),'')),lower(?))>0");args.push(q.q.trim().slice(0,120));}
 if(q.state==='followed')where.push('u.followed=1');
 if(q.state==='saved')where.push('u.saved=1');
 if(q.state==='notes')where.push("length(trim(COALESCE(u.note,'')))>0");
 if(q.date){where.push("EXISTS(SELECT 1 FROM story_articles sa JOIN digests d ON d.date=? WHERE sa.story_id=st.id AND sa.article_id IN(SELECT value FROM json_each(COALESCE(d.article_ids,'[]'))))");args.push(q.date);}
 const filter=where.length?' WHERE '+where.join(' AND '):'';
 const total=Number(db.prepare('SELECT count(*) n FROM ('+select+filter+')').get(...args)?.n||0);
 const limit=Math.max(1,Math.min(50,Math.floor(Number(q.limit))||15)),pages=Math.max(1,Math.ceil(total/limit)),page=Math.min(pages,Math.max(1,parseInt(q.page||'1',10)||1));
 const items=db.prepare(select+filter+' ORDER BY st.latest_at DESC,st.id LIMIT ? OFFSET ?').all(...args,limit,(page-1)*limit) as Story[];
 return {items,total,page,pages};
}
export function getStory(id:string){return db.prepare(select+' WHERE st.id=?').get(id) as Story|undefined;}
export function getStoryReports(id:string){return db.prepare("SELECT a.id,a.title,a.url,a.publisher,a.source_tier,a.is_primary,a.published_at,a.fetched_at,s.summary,tr.title_zh,j.content judgment FROM story_articles sa JOIN articles a ON a.id=sa.article_id LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id WHERE sa.story_id=? ORDER BY COALESCE(a.published_at,a.fetched_at) DESC,a.id DESC").all(id);}
export function updateStoryState(id:string,action:'follow'|'save'|'note'|'read',value:boolean|string|number){
 const user=currentUserContext(),story=getStory(id);if(!story)return false;const now=new Date().toISOString();
 db.transaction(()=>{
  db.prepare('INSERT OR IGNORE INTO story_state(profile_id,story_id,updated_at) VALUES(?,?,?)').run(user.id,id,now);
  const column={follow:'followed',save:'saved',note:'note',read:'last_read_update'}[action];
  const next=action==='read'?Math.min(story.revision,Math.max(story.last_read_update,Number(value))):typeof value==='boolean'?Number(value):value;
  db.prepare('UPDATE story_state SET '+column+'='+(action==='read'?'max(last_read_update,?)':'?')+',updated_at=? WHERE profile_id=? AND story_id=?').run(next,now,user.id,id);
  db.prepare('INSERT INTO product_activity(action,target_id,created_at) VALUES(?,?,?)').run(action,id,now);
 });return true;
}
export function contentStatus(){
 const article=db.prepare('SELECT max(fetched_at) latest FROM articles').get();
 const checked=db.prepare("SELECT max(finished_at) checked FROM job_runs WHERE finished_at IS NOT NULL AND source_results IS NOT NULL AND source_results!='[]'").get();
 const worker=db.prepare('SELECT heartbeat_at,last_error FROM scheduler_state WHERE id=1').get();
 return {latest:article?.latest as string|null,checked:checked?.checked as string|null,running:Boolean(worker?.heartbeat_at&&Date.now()-Date.parse(worker.heartbeat_at)<120000),stale:!article?.latest||Date.now()-Date.parse(article.latest)>36*3600000};
}
export function overview(){
 const recent=(items:Story[])=>{const fresh=items.filter(s=>Date.parse(s.latest_at)>=Date.now()-14*86400000);return fresh.length?fresh:items;};
 // Query independently: global feed volume must never push China out of the candidate window.
 const pool=[...recent(queryStories({sector:'macro',region:'china',limit:50}).items),...recent(queryStories({sector:'macro',region:'global',limit:50}).items)];
 const policy=(s:Story)=>/利率|货币|经济运行|经济数据|GDP|CPI|FOMC statement|Money Market Operations|monetary policy decisions|inflation|employment/i.test(s.title)?1:0;
 const importance=(a:Story,b:Story)=>policy(b)-policy(a)||Number(b.source_tier==='official'&&b.is_primary)-Number(a.source_tier==='official'&&a.is_primary)||Date.parse(b.latest_at)-Date.parse(a.latest_at);
 const window=overviewWindow(pool);
 const china=window.items.filter(s=>s.region==='china').sort(importance),world=window.items.filter(s=>s.region!=='china').sort(importance);
 const background=pool.filter(s=>!window.items.some(x=>x.id===s.id)).sort((a,b)=>Date.parse(b.latest_at)-Date.parse(a.latest_at));
 const pick=(items:Story[],limit:number,byRegion=false)=>{
  const chosen:Story[]=[],groups=new Set<string>(),titles=new Set<string>();
  const titleKey=(s:Story)=>s.publisher+'|'+s.title.replace(/\([^)]*\)/g,'').replace(/公开市场业务交易公告.*/,'公开市场业务交易公告').replace(/\s+/g,'').toLowerCase();
  for(const diverse of [true,false])for(const s of items){if(chosen.length>=limit)break;const group=byRegion?s.region:s.publisher,key=titleKey(s);if(chosen.some(x=>x.id===s.id)||titles.has(key)||(diverse&&groups.has(group)))continue;chosen.push(s);groups.add(group);titles.add(key);}
  return chosen;
 };
 const selected=[...pick(china,3),...pick(world,2,true)];
 for(const s of pick([...china,...world],5))if(selected.length<5&&!selected.some(x=>x.id===s.id))selected.push(s);
 return {selected,window,background:background.slice(0,4),world:world.slice(0,4),china:china.slice(0,4),followed:queryStories({state:'followed',limit:5}).items,status:contentStatus()};
}
export function selectionReason(s:Story){return s.sector==='macro'?(s.source_tier==='official'&&s.is_primary?'官方政策或统计发布，优先核对其变化与适用范围。':'宏观相关报道，需对照原始发布与统计口径。'):'产业变化线索，关注实际进展及其商业兑现条件。';}
