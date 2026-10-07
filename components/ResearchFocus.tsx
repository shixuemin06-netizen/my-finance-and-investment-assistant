import Link from 'next/link';
import db from '@/lib/db';
import JudgmentView from './JudgmentView';
export default function ResearchFocus() {
  const rows=db.prepare('SELECT a.id,a.title,a.url,a.fetched_at,j.content FROM article_judgments j JOIN articles a ON a.id=j.article_id ORDER BY a.id DESC LIMIT 2').all();
  if(!rows.length)return null;
  return <section className="research-focus"><div className="section-heading"><div><p className="section-label">BEYOND THE HEADLINE</p><h2>从消息到判断</h2></div><Link href="/matrix" className="text-link">继续研究 →</Link></div>{rows.map(row=><article key={row.id}><p className="quiet-copy">收录 {row.fetched_at.slice(0,10)} · <a href={row.url} target="_blank" rel="noreferrer">{row.title} ↗</a></p><JudgmentView value={JSON.parse(row.content)}/></article>)}</section>;
}
