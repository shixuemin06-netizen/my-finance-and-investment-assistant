import { eventKey, storyId, type StoryArticle } from './story-classification';

export type EventMaterial = StoryArticle & { raw_text?:string|null };
export type EventLinkDecision = {
 status:'confirmed'|'review'|'separate';
 reasons:string[];
 bodyCoverage:{left:number;right:number};
 titleOverlap:number;
};
export type GroupedEvent = {
 id:string;key:string;articleIds:number[];representativeArticleId:number;
 sourceFamilies:Array<{key:string;articleIds:number[];basis:'attribution'|'shared_wording'|'publisher'}>;
 sourceFamilyCount:number;independence:'unverified'|'shared_origin';
 /** Deprecated compatibility field: this is a source-family count, never verified corroboration. */
 independentSourceCount:number;
};
export type EventGrouping = {
 groups:GroupedEvent[];
 reviewPairs:Array<{leftArticleId:number;rightArticleId:number;reasons:string[]}>;
 counts:{materials:number;events:number;mergedMaterials:number;mergedGroups:number;reviewPairs:number};
};
type Features={article:EventMaterial;canonical:string;title:string;titleParts:Set<string>;bodyParts:Set<string>;bodyLength:number;publishedDay:string|null;explicitDates:string[];numbers:string[];bodyNumbers:string[];action:string;origin:string|null;publisher:string};

const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[\p{P}\p{S}]/gu,'');
function shingles(s:string,n:number){const out=new Set<string>();for(let i=0;i<=s.length-n;i++)out.add(s.slice(i,i+n));return out;}
function coverage(a:Set<string>,b:Set<string>){let common=0;for(const item of a)if(b.has(item))common++;return {left:a.size?common/a.size:0,right:b.size?common/b.size:0};}
function day(value?:string|null){if(!value)return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString().slice(0,10):null;}
function canonical(a:EventMaterial){try{const u=new URL(a.canonical_url||a.url);u.hash='';for(const k of Array.from(u.searchParams.keys()))if(/^utm_|^(?:from|source|spm)$/i.test(k))u.searchParams.delete(k);return u.href;}catch{return '';}}
function originOf(a:EventMaterial){
 const head=(a.raw_text||'').slice(0,350);
 const m=head.match(/(?:来源|转载自|稿源|据)\s*[:：]?\s*(新华社|新华网|人民日报|人民网|央视新闻|中国新闻网|中国经济网|证券时报|上海证券报|中国证券报|经济日报|Reuters|Bloomberg|Associated Press)/i)
  ||head.match(/^(?:\s*[^\n]{0,40}\n){0,4}\s*(新华社|Reuters|Associated Press)(?:[^\n。]{0,50}(?:电|报道|reports?))/i);
 return m?normalize(m[1]):null;
}
function features(a:EventMaterial):Features{
 const title=normalize(a.title),body=normalize((a.raw_text||'').replace(/^(?:来源|类型|分类)[^\n]*\n/gm,'')).slice(0,12000);
 const explicitDates=Array.from(a.title.matchAll(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})(?:日|号)?/g),m=>m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
 const action=/降息|下调利率|cuts?\s+(?:interest\s+)?rates?/i.test(a.title)?'rate_cut':/加息|上调利率|raises?\s+(?:interest\s+)?rates?/i.test(a.title)?'rate_raise':/维持利率|保持利率|hold[s]?\s+(?:interest\s+)?rates?/i.test(a.title)?'rate_hold':
 /撤销|废止|取消|repeal|withdraw/i.test(a.title)?'withdraw':/正式实施|生效|takes? effect|effective/i.test(a.title)?'effective':/征求意见|草案|draft|consultation/i.test(a.title)?'draft':'';
 let publisher=normalize(a.publisher||'');try{if(!publisher)publisher=new URL(a.url).hostname.replace(/^www\./,'');}catch{}
 const bodyNumbers=Array.from(new Set(((a.raw_text||'').normalize('NFKC').match(/\d+(?:\.\d+)?\s*(?:个?基点|%|bp|万亿元|亿元|亿美元|万吨|兆瓦|吉瓦)/gi)||[]).map(s=>s.toLowerCase().replace(/\s+/g,'')))).sort();
 return {article:a,canonical:canonical(a),title,titleParts:shingles(title,3),bodyParts:shingles(body,5),bodyLength:body.length,publishedDay:day(a.published_at),explicitDates,numbers:(a.title.match(/\d+(?:\.\d+)?/g)||[]).sort(),bodyNumbers,action,origin:originOf(a),publisher};
}
/** Structural identifiers, publication period, policy action and substantive body agreement
 * are checked separately. Headline similarity by itself never confirms a cross-source link. */
function compare(a:Features,b:Features):EventLinkDecision{
 const titleCoverage=coverage(a.titleParts,b.titleParts);
 let bodyCoverage={left:0,right:0};
 const titleOverlap=Math.min(titleCoverage.left,titleCoverage.right),result=(status:EventLinkDecision['status'],...reasons:string[]):EventLinkDecision=>({status,reasons,bodyCoverage,titleOverlap});
 if(a.canonical&&a.canonical===b.canonical)return result('confirmed','same_canonical_material');
 const exactTitle=a.title===b.title&&a.title.length>=8;
 if(!exactTitle&&titleOverlap<.56)return result('separate','different_subject_or_action');
 if(a.explicitDates.length&&b.explicitDates.length&&a.explicitDates.join('|')!==b.explicitDates.join('|'))return result('separate','different_explicit_event_date');
 if(a.numbers.length&&b.numbers.length&&a.numbers.join('|')!==b.numbers.join('|'))return result('separate','different_period_or_fact_numbers');
 if(a.action&&b.action&&a.action!==b.action)return result('separate','different_policy_action');
 if(!a.publishedDay||!b.publishedDay)return result('review','publication_date_missing');
 const days=Math.abs(Date.parse(a.publishedDay)-Date.parse(b.publishedDay))/86400000;
 if(days>2)return result('separate','publication_period_too_far_apart');
 const sameExplicitDate=a.explicitDates.length>0&&a.explicitDates.join('|')===b.explicitDates.join('|');
 if(a.publishedDay!==b.publishedDay&&!sameExplicitDate)return result('review','cross_day_event_identity_requires_review');
 if(a.bodyLength<120||b.bodyLength<120)return result('review','insufficient_substantive_body');
 bodyCoverage=coverage(a.bodyParts,b.bodyParts);
 if(a.bodyNumbers.length&&b.bodyNumbers.length&&a.bodyNumbers.join('|')!==b.bodyNumbers.join('|'))return result('review','body_fact_numbers_require_review');
 const minCoverage=Math.min(bodyCoverage.left,bodyCoverage.right);
 if((exactTitle&&minCoverage>=.72)||(!exactTitle&&titleOverlap>=.7&&minCoverage>=.84))return result('confirmed','matching_event_period','matching_title_subject','substantive_body_agreement');
 if(exactTitle||titleOverlap>=.7)return result('review',minCoverage>=.35?'same_subject_insufficient_body_agreement':'title_body_conflict_or_distinct_report');
 return result('separate','insufficient_event_identity');
}
export function compareEventMaterials(a:EventMaterial,b:EventMaterial):EventLinkDecision{return compare(features(a),features(b));}

function representative(rows:EventMaterial[]){
 return [...rows].sort((a,b)=>Number(b.source_tier==='official'&&b.is_primary===1)-Number(a.source_tier==='official'&&a.is_primary===1)||(b.raw_text?.length||0)-(a.raw_text?.length||0)||a.id-b.id)[0];
}
/** Pure publication grouping. It never mutates local stories, follow state or historic digests.
 * New links require every member of a group to agree, avoiding transitive topic clusters. */
export function groupEventArticles(articles:EventMaterial[]):EventGrouping{
 const rows=[...articles].sort((a,b)=>a.id-b.id),fs=rows.map(features),groups:number[][]=[],reviewPairs:EventGrouping['reviewPairs']=[];
 const compared=new Map<string,EventLinkDecision>();
 const pair=(i:number,j:number)=>{const key=Math.min(i,j)+':'+Math.max(i,j);let r=compared.get(key);if(!r){r=compare(fs[i],fs[j]);if(r.status!=='separate')compared.set(key,r);}return r;};
 for(let i=0;i<rows.length;i++){
  let chosen:number[]|undefined;
  for(const group of groups){
   const decisions=group.map(j=>({j,result:pair(i,j)}));
   for(const {j,result} of decisions)if(result.status==='review')reviewPairs.push({leftArticleId:rows[j].id,rightArticleId:rows[i].id,reasons:result.reasons});
   if(decisions.every(x=>x.result.status==='confirmed')){chosen=group;break;}
  }
  if(chosen)chosen.push(i);else groups.push([i]);
 }
 const events:GroupedEvent[]=groups.map(indexes=>{
  const members=indexes.map(i=>rows[i]),anchor=members[0],familyGroups:number[][]=[];
  for(const i of indexes){
   const match=familyGroups.find(g=>g.some(j=>
    (fs[i].canonical&&fs[i].canonical===fs[j].canonical)||
    (fs[i].origin&&fs[i].origin===fs[j].origin)||
    fs[i].publisher===fs[j].publisher||
    Math.min(pair(i,j).bodyCoverage.left,pair(i,j).bodyCoverage.right)>=.8));
   if(match)match.push(i);else familyGroups.push([i]);
  }
  const sourceFamilies=familyGroups.map(g=>{
   const origins=g.map(i=>fs[i].origin).filter((v):v is string=>Boolean(v));
   const hasSharedText=g.length>1&&new Set(g.map(i=>fs[i].publisher)).size>1;
   const basis:GroupedEvent['sourceFamilies'][number]['basis']=origins.length?'attribution':hasSharedText?'shared_wording':'publisher';
   const key=origins.length?'attributed:'+origins.sort()[0]:hasSharedText?'shared-text:'+rows[g[0]].id:'publisher:'+fs[g[0]].publisher;
   return {key,articleIds:g.map(i=>rows[i].id),basis};
  });
  const key=eventKey(anchor);
  return {id:storyId(key),key,articleIds:members.map(a=>a.id),representativeArticleId:representative(members).id,sourceFamilies,sourceFamilyCount:sourceFamilies.length,independence:sourceFamilies.some(f=>f.basis==='attribution'||f.basis==='shared_wording')?'shared_origin':'unverified',independentSourceCount:sourceFamilies.length};
 });
 const uniqueReview=new Map(reviewPairs.map(p=>[p.leftArticleId+':'+p.rightArticleId,p]));
 return {groups:events,reviewPairs:[...uniqueReview.values()],counts:{materials:rows.length,events:events.length,mergedMaterials:rows.length-events.length,mergedGroups:events.filter(g=>g.articleIds.length>1).length,reviewPairs:uniqueReview.size}};
}
