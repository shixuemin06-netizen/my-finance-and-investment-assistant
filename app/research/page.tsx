import Link from 'next/link';
import AppShell from '@/components/AppShell';
import StoryList,{EmptyState} from '@/components/StoryList';
import {Pager} from '@/components/DiscoveryPage';
import ResearchNote from '@/components/ResearchNote';
import {queryStories} from '@/lib/stories';
import {legacyResearch,formatDate} from '@/lib/reader';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string;page?:string}>}){
 const {tab:input,page}=await searchParams,tab=['followed','saved','notes'].includes(input||'')?input!:'followed';
 const result=queryStories({state:tab,page}),old=tab==='followed'?[]:legacyResearch(tab);
 return <AppShell active="research"><main className="single-page"><header className="page-heading"><p className="eyebrow">个人研究空间</p><div className="heading-line"><h1>我的研究</h1><div className="action-buttons"><Link href="/import" className="secondary-button">添加材料</Link><a href="/api/research/export" className="text-link" download>导出笔记 ↓</a></div></div><p>把值得持续追踪的变化，积累成自己的判断。</p></header><nav className="filter-tabs" aria-label="研究分类">{[['followed','关注'],['saved','收藏'],['notes','笔记']].map(([k,v])=><Link key={k} href={'/research?tab='+k} className={tab===k?'active':''} aria-current={tab===k?'page':undefined}>{v}</Link>)}</nav>{tab==='followed'&&<p className="quiet-copy">有新进展表示上次标记已读之后，加入了报道或新的摘要。</p>}{result.items.length?<StoryList items={result.items} notes={tab==='notes'}/>:!old.length&&<EmptyState title={tab==='followed'?'还没有关注的事件':tab==='saved'?'还没有收藏的材料':'把第一条判断记下来'} text="打开一件感兴趣的变化，核对原文后，关注或记下你的问题。" href="/macro" action="浏览宏观趋势"/>}<Pager route="/research" query={{tab,page}} {...result}/>{old.length>0&&<section className="legacy-list"><div className="section-heading"><h2>文章{tab==='notes'?'笔记':'收藏'}</h2><span className="quiet-copy">原有研究记录已保留</span></div>{old.map(a=><article className="source-row" key={a.id}><small>{a.publisher||'原始材料'} · {formatDate(a.published_at||a.fetched_at)}</small><h3><Link href={'/articles/'+a.id}>{a.title}</Link></h3>{a.note&&<blockquote className="saved-note">{a.note}</blockquote>}<ResearchNote articleId={a.id} initialSaved={Boolean(a.saved)} initialNote={a.note} initialHorizon={a.horizon}/></article>)}</section>}</main></AppShell>;
}