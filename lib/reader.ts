import db from './db';
export function formatDate(value:string|null|undefined,withTime=false){
 if(!value||!Number.isFinite(Date.parse(value)))return '暂无记录';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))withTime=false;
 return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(value));
}
export function externalUrl(value:string){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
export function readJudgment(value:string|null|undefined):Record<string,any>|null {try{const j=JSON.parse(value||'null');return j&&typeof j==='object'?j:null;}catch{return null;}}
export function getArticle(id:number){return db.prepare("SELECT a.*,s.summary,tr.title_zh,j.content judgment,n.note,n.saved,n.horizon,sa.story_id FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id LEFT JOIN research_notes n ON n.article_id=a.id LEFT JOIN story_articles sa ON sa.article_id=a.id WHERE a.id=?").get(id);}
export function legacyResearch(state:string){return db.prepare("SELECT a.id,a.title,a.publisher,a.url,a.published_at,a.fetched_at,n.note,n.saved,n.horizon FROM research_notes n JOIN articles a ON a.id=n.article_id WHERE "+(state==='saved'?'n.saved=1':"length(trim(n.note))>0")+" ORDER BY n.updated_at DESC").all();}
export function storyUpdates(id:string){return db.prepare("SELECT su.*,a.title,a.publisher FROM story_updates su JOIN articles a ON a.id=su.article_id WHERE su.story_id=? ORDER BY su.id DESC").all(id);}
export function dailyArchive(){return db.prepare("SELECT d.*, (SELECT count(*) FROM summaries s WHERE s.article_id IN(SELECT value FROM json_each(COALESCE(d.article_ids,'[]')))) summary_count FROM digests d ORDER BY d.date DESC").all();}
