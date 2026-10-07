/** Refresh the seven newly added official sources without models or digest regeneration. */
import fs from 'node:fs';
import path from 'node:path';
import db from '../lib/db';
import {buildAdapters,crawlAllAdapters,recordSourceResults,syncSourceRegistry} from '../crawlers/adapters/registry';
import {ingestArticles} from '../pipeline/ingest';
import {syncStories} from '../lib/stories';
import {startJob,finishJob,type SourceResult,type StageTimings} from '../lib/jobs';
const addedSources=new Set([
 'rss:美国能源信息署 EIA · 能源观察',
 'web:美国经济分析局 BEA',
 'web:欧洲委员会 · 金融政策',
 'web:日本经济产业省 METI',
 'web:工业和信息化部 · 新闻发布',
 'web:商务部 · 新闻发布',
 'web:文化和旅游部 · 信息发布',
]);
async function main(){
 const adapters=buildAdapters().filter(a=>addedSources.has(a.id));
 if(adapters.length!==addedSources.size)throw Error('新增官方源配置不完整，未开始采集');
 const runId=startJob('manual'),startedAt=new Date().toISOString(),timings:StageTimings={};
 const results:SourceResult[]=[],before=Number(db.prepare('SELECT COALESCE(max(id),0) id FROM articles').get()?.id||0);
 let newCount=0,skippedCount=0,failedCount=0;
 try{
  syncSourceRegistry();
  for(const adapter of adapters){
   const started=Date.now(),crawled=await crawlAllAdapters([adapter]);
   timings.crawl=(timings.crawl||0)+Date.now()-started;
   results.push(...crawled.sourceResults);recordSourceResults(crawled.sourceResults);
   const ingestAt=Date.now(),added=ingestArticles(crawled.articles);
   timings.ingest=(timings.ingest||0)+Date.now()-ingestAt;
   newCount+=added;skippedCount+=Math.max(0,crawled.articles.length-added);
   console.log('[入库] '+adapter.name+': 新增 '+added+' / 返回 '+crawled.articles.length);
  }
  const syncAt=Date.now();syncStories();timings.analyze=Date.now()-syncAt;
  failedCount=results.filter(r=>!r.ok).length;
  const newArticles=db.prepare('SELECT id,title,publisher,published_at FROM articles WHERE id>? ORDER BY id').all(before);
  const distribution=db.prepare('SELECT st.sector,count(*) count FROM stories st GROUP BY st.sector ORDER BY count DESC').all();
  const newDistribution=db.prepare('SELECT st.sector,count(*) count FROM stories st WHERE st.representative_article_id>? GROUP BY st.sector ORDER BY count DESC').all(before);
  finishJob(runId,{status:failedCount?'partial':'success',sourceResults:results,stageTimings:timings,newCount,skippedCount,failedCount});
  const report={runId,startedAt,finishedAt:new Date().toISOString(),modelCalls:0,newCount,skippedCount,failedCount,sourceResults:results,newArticleIds:newArticles.map(a=>a.id),newArticles,distribution,newDistribution};
  const reportPath=path.resolve('outputs/product-refinement-20260926/authoritative-source-refresh.json');
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({runId,newCount,skippedCount,failedCount,newArticleIds:report.newArticleIds,distribution,newDistribution,reportPath},null,2));
 }catch(error){
  finishJob(runId,{status:'failed',sourceResults:results,stageTimings:timings,newCount,skippedCount,failedCount:Math.max(1,failedCount)});
  throw error;
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'采集失败');process.exitCode=1;});
