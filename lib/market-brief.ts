import db from './db';
import {readResearchJudgment} from './research-judgment';
import {overviewWindow} from './overview-window';
export function marketBrief(now=Date.now()){
 const rows=db.prepare("SELECT a.id,a.title,tr.title_zh,a.raw_text,a.raw_html,a.published_at,COALESCE(a.published_at,a.fetched_at) latest_at,a.publisher,a.url,s.summary,s.tags,b.source_fingerprint,j.content judgment,sa.story_id FROM article_judgments j JOIN articles a ON a.id=j.article_id LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN generation_basis b ON b.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id JOIN story_articles sa ON sa.article_id=a.id JOIN stories st ON st.id=sa.story_id WHERE st.sector='macro' AND a.published_at IS NOT NULL ORDER BY a.published_at DESC LIMIT 100").all();
 const window=overviewWindow(rows as any[],now);
 const seen=new Set<string>();
 return {label:window.label,items:window.items.flatMap((r:any)=>{const value=readResearchJudgment(r,true);if(!value||seen.has(r.story_id||String(r.id)))return [];seen.add(r.story_id||String(r.id));return [{...r,title:r.title_zh||r.title,judgment:value}];}).slice(0,3)};
}
