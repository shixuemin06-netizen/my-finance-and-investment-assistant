import db from '@/lib/db';
import DailyDigest from '@/components/DailyDigest';
import AppShell from '@/components/AppShell';
import {EmptyState} from '@/components/StoryList';
import {getSourcePulse,parseArticleIds} from '@/lib/research';
import type {ArticleRow,DigestRow} from '@/lib/types';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{date:string}>}){
 const {date}=await params,digest=db.prepare('SELECT * FROM digests WHERE date=?').get(date) as DigestRow|undefined;
 if(!digest?.full_content_md)return <AppShell active="daily"><main className="single-page"><EmptyState title="该日期没有日报" text="可以从已归档日期中选择一期。" href="/daily" action="返回日报归档"/></main></AppShell>;
 const ids=parseArticleIds(digest.article_ids);const pending=ids.length?db.prepare("SELECT a.id,a.title,a.url FROM articles a LEFT JOIN summaries s ON s.article_id=a.id WHERE a.id IN("+ids.map(()=>'?').join(',')+") AND (s.article_id IS NULL OR length(trim(s.summary))=0)").all(...ids) as ArticleRow[]:[];
 return <DailyDigest digest={digest} pulse={getSourcePulse(date)} pending={pending}/>;
}