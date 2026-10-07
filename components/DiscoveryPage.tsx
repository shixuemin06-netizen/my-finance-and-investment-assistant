import Link from 'next/link';
import AppShell from './AppShell';
import StoryList,{EmptyState} from './StoryList';
import {queryStories,regions,themes,sectors,type StoryQuery} from '@/lib/stories';
import {industrySectorKeys,industryRegionQuery} from '@/lib/story-classification';
export function queryLink(route:string,q:StoryQuery,patch:StoryQuery){const p=new URLSearchParams();for(const [k,v]of Object.entries({...q,...patch,page:patch.page||undefined}))if(v)p.set(k,String(v));return route+'?'+p;}
export function Pager({route,query,page,pages}:{route:string;query:StoryQuery;page:number;pages:number}){if(pages<=1)return null;return <nav className="library-pager" aria-label="分页">{page>1?<Link href={queryLink(route,query,{page:String(page-1)})}>← 上一页</Link>:<span>已是第一页</span>}<span>{page} / {pages}</span>{page<pages?<Link href={queryLink(route,query,{page:String(page+1)})}>下一页 →</Link>:<span>已是最后一页</span>}</nav>;}
export default function DiscoveryPage({kind,query}:{kind:'macro'|'industry';query:StoryQuery}){
 const macro=kind==='macro',route='/'+kind;
 const q:StoryQuery={...query,sector:macro?'macro':(industrySectorKeys.includes(query.sector as typeof industrySectorKeys[number])?query.sector:'ai'),region:macro?query.region:industryRegionQuery(query.region)};
 const result=queryStories(q);
 const sectorTotal=result.total||queryStories({sector:q.sector,limit:1}).total;
 const regionOptions=macro?Object.entries(regions):[['china','中国'],['us','美国']];
 const topics=macro?[['monetary','政策传导'],['growth','增长与就业'],['prices','物价与消费']]:[['semiconductor','半导体供需'],['manufacturing','制造与设备投资'],['energy','能源与电力'],['tourism','文旅产业'],['consumer','新消费']];
 return <AppShell active={kind}><main className="reader-layout"><div className="primary-column">
  <header className="page-heading"><p className="eyebrow">{macro?'地区 · 政策 · 经济周期':'产业跟踪'}</p><h1>{macro?'宏观趋势':sectors[q.sector as keyof typeof sectors]}</h1></header>
  <div className="filter-panel">
   {!macro&&<nav className="filter-tabs" aria-label="产业板块">{industrySectorKeys.map(k=><Link key={k} className={q.sector===k?'active':''} href={queryLink(route,q,{sector:k})}>{sectors[k]}</Link>)}</nav>}
   <div className="filter-line"><span>地区</span><nav className="filter-tabs" aria-label="地区筛选">
    {macro&&<Link className={!q.region?'active':''} href={queryLink(route,q,{region:undefined})}>全部</Link>}
    {regionOptions.map(([k,v])=><Link key={k} className={q.region===k?'active':''} href={queryLink(route,q,{region:k})}>{v}</Link>)}
    {!macro&&<Link className={!q.region?'active':''} href={queryLink(route,q,{region:undefined})}>全部地区</Link>}
   </nav></div>
   {macro&&<div className="filter-line"><span>主题</span><nav className="filter-tabs" aria-label="宏观主题"><Link className={!q.theme?'active':''} href={queryLink(route,q,{theme:undefined})}>全部</Link>{Object.entries(themes).filter(([k])=>!['industry','general'].includes(k)).map(([k,v])=><Link key={k} className={q.theme===k?'active':''} href={queryLink(route,q,{theme:k})}>{v}</Link>)}</nav></div>}
  </div>
  <div className="library-meta"><span>{result.total} 个事件与材料</span><span>按实际发布日期排列</span></div>
  {result.total?<StoryList items={result.items} numbered/>:<EmptyState title={sectorTotal?'当前筛选没有匹配材料':'该板块尚未收录材料'} text={sectorTotal?'该板块已有材料，但当前地区或关键词没有匹配结果。可清除筛选后继续阅读。':'采集与分类后才会在这里呈现内容。暂无收录不代表这个行业没有动态；可先检索全部资料并核对原文。'} href={sectorTotal?queryLink(route,q,{region:undefined,q:undefined,theme:undefined,date:undefined}):'/search'} action={sectorTotal?'查看该板块全部材料':'检索全部资料'}/>}
  <Pager route={route} query={q} {...result}/></div>
  <aside className="context-rail"><section><h2>持续议题</h2><nav className="more-links">{topics.map(([k,v])=><Link key={k} href={queryLink(route,q,macro?{theme:k}:{sector:k})}>{v} →</Link>)}</nav><Link href="/search" className="text-link">检索全部资料 →</Link></section></aside>
 </main></AppShell>;
}
