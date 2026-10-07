import db from './db';
export type SummaryStatus = {kind:'ready'|'attachment'|'title_only'|'historical'|'failed'|'pending';label:string;message:string};
type SummaryMaterial = {title?:string|null;summary?:string|null;url?:string|null;raw_text?:string|null;fetched_at?:string|null;published_at?:string|null;failure_status?:string|null};
const DAY=86_400_000;
/** Explain why a summary is absent without revealing provider responses or account information. */
export function summaryStatus(a:SummaryMaterial,now=Date.now()):SummaryStatus {
  if(a.summary?.trim())return {kind:'ready',label:'摘要已生成',message:'摘要已生成，可对照原始来源。'};
  const body=(a.raw_text||'').trim();
  let isAttachment=false;
  try{isAttachment=/\.(pdf|xlsx?|csv|docx?|pptx?|zip)$/i.test(new URL(a.url||'').pathname);}catch{}
  if(isAttachment&&(!body||body.length<50||body===a.title?.trim()))return {kind:'attachment',label:'原始附件',message:'来源提供附件，尚未提取可概括的正文；可打开原始发布核对。'};
  if(body.length<50||body===a.title?.trim())return {kind:'title_only',label:'正文待补',message:'当前订阅仅提供标题或极短节选，信息不足以生成可靠摘要；可先核对原文。'};
  if(a.failure_status)return {kind:'failed',label:'摘要暂未完成',message:'这条材料上次处理未完成，等待重试；已保存原文仍可阅读。'};
  const dates=[a.fetched_at,a.published_at].filter(Boolean).map(d=>Date.parse(d!)).filter(Number.isFinite);
  if(dates.some(d=>d<now-7*DAY))return {kind:'historical',label:'历史材料',message:'这条历史材料未自动付费重做摘要，原文与链接保留。'};
  return {kind:'pending',label:'待摘要',message:'材料已保存，正在等待摘要处理；可先阅读原始发布。'};
}

/** One batched server-side lookup for missing list summaries; no mutation on reads. */
export function storySummaryStatuses(articleIds:number[]):Map<number,SummaryStatus> {
  const ids=[...new Set(articleIds.filter(Number.isInteger))];
  if(!ids.length)return new Map();
  const rows=db.prepare('SELECT a.id,a.title,a.url,a.raw_text,a.fetched_at,a.published_at,s.summary,f.status failure_status FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN summary_failures f ON f.article_id=a.id WHERE a.id IN('+ids.map(()=>'?').join(',')+')').all(...ids);
  return new Map(rows.map(a=>[Number(a.id),summaryStatus(a)]));
}
