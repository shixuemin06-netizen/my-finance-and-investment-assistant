import AppShell from '@/components/AppShell';
import StoryList from '@/components/StoryList';
import {Pager} from '@/components/DiscoveryPage';
import {queryStories,type StoryQuery} from '@/lib/stories';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<StoryQuery>}){const q=await searchParams;const result=queryStories(q);return <AppShell active="search"><main className="single-page search-results"><header className="page-heading"><p className="eyebrow">资料库</p><h1>全站搜索</h1></header><form className="search-form" action="/search"><input name="q" type="search" aria-label="搜索资料库" defaultValue={q.q} maxLength={120} placeholder="输入主题、机构或事件关键词"/><button className="primary-button">搜索</button></form><div className="library-meta"><span>{q.q?'“'+q.q+'” · ':''}{result.total} 个结果</span></div><StoryList items={result.items}/><Pager route="/search" query={q} {...result}/></main></AppShell>;}
