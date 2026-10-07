import Link from 'next/link';
import { getHotTopics } from '@/lib/hot-topics';
export default function HotTopics() {
  const {topics}=getHotTopics();
  return <section className="hot-rail"><p className="section-label">IN FOCUS · 7 DAYS</p><div className="section-heading"><h2>站内热点</h2><Link href="/hot" className="text-link">展开 →</Link></div><ol>{topics.slice(0,5).map((item,i)=><li key={item.topic}><span>{String(i+1).padStart(2,'0')}</span><Link href={'/hot#topic-'+encodeURIComponent(item.topic)}>{item.topic}<small>{item.count} 篇 · {item.sources} 个来源</small></Link></li>)}</ol>{!topics.length&&<p>近 7 天还没有可归类材料。</p>}<p className="quiet-copy">按近 7 天收录报道量排序，反映本站关注分布。</p></section>;
}
