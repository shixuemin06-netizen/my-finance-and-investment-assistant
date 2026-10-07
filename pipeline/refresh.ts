import db from '../lib/db';
import {crawlAllAdapters,recordSourceResults,syncSourceRegistry} from '../crawlers/adapters/registry';
import {ingestArticles} from './ingest';
import {mergeStagedArticles} from './import';
import {summarizeAll} from './summarize';
import {generateDigest} from './generate';
import {syncStories} from '../lib/stories';
import {startJob,finishJob,type SourceResult} from '../lib/jobs';
import {beijingToday} from '../lib/time';
import {runSummaryBatches} from '../lib/scheduling';
export async function refreshContent(shouldStop:()=>boolean=()=>false){
 const runId=startJob('daily'),started=Date.now(),date=beijingToday();
 let results:SourceResult[]=[],newCount=0;
 db.prepare('INSERT INTO scheduler_state(id,last_attempt_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at').run(new Date().toISOString());
 try{
  syncSourceRegistry();
  const data=await crawlAllAdapters();results=data.sourceResults;recordSourceResults(results);
  newCount=ingestArticles(data.articles)+await mergeStagedArticles();
  syncStories();
  // Do not spend on a historical archive merely because it was just imported.
  const ids=db.prepare("SELECT id FROM articles WHERE julianday(fetched_at)>=julianday('now','-7 days') AND (published_at IS NULL OR julianday(published_at)>=julianday('now','-7 days')) ORDER BY id DESC LIMIT 200").all().map(r=>Number(r.id));
  const done=await runSummaryBatches(()=>summarizeAll(undefined,'fetched_at',5,ids),shouldStop);
  syncStories(ids);generateDigest(date);
  const failed=results.filter(s=>!s.ok).length;
  const pending=ids.length?Number(db.prepare('SELECT count(*) n FROM articles a LEFT JOIN summaries s ON s.article_id=a.id WHERE s.article_id IS NULL AND a.id IN ('+ids.map(()=>'?').join(',')+')').get(...ids)?.n||0):0;
  finishJob(runId,{status:failed||pending?'partial':'success',sourceResults:results,stageTimings:{generate:Date.now()-started},newCount,skippedCount:Math.max(0,data.articles.length-newCount),failedCount:failed});
  const success=results.some(s=>s.ok);
  db.prepare('UPDATE scheduler_state SET last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,last_error=? WHERE id=1').run(Number(success),new Date().toISOString(),failed?failed+' 个来源暂不可用':pending?'仍有材料待摘要（预算、正文或模型可用性限制）':null);
  return {newCount,done,failed};
 }catch(error){
  finishJob(runId,{status:'failed',sourceResults:results,stageTimings:{generate:Date.now()-started},newCount,skippedCount:0,failedCount:1});
  db.prepare('UPDATE scheduler_state SET last_error=? WHERE id=1').run('更新未完成，已保存内容可继续阅读');
  throw error;
 }
}
