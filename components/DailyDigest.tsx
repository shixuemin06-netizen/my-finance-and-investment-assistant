import Link from 'next/link';
import AppShell from './AppShell';
import DigestBody from './DigestBody';
import { formatDate } from '@/lib/reader';
import type { ArticleRow, SourcePulse, DigestRow } from '@/lib/types';

export default function DailyDigest({ digest }: { digest: DigestRow; pulse: SourcePulse; pending: ArticleRow[] }) {
  return <AppShell active="daily" eyebrow={'日报 · ' + digest.date}><main className="reader-page">
    <article className="reader-sheet daily-report-sheet"><header className="reader-header"><p className="section-label">财经日报 · {digest.date}</p><h1>{digest.title || '财经日报'}</h1><div className="reader-meta"><span>收录日期 {digest.date}</span><span>更新于 {formatDate(digest.generated_at, true)}</span><Link href={'/daily?date=' + digest.date}>切换日期</Link><Link href={'/share/' + digest.date}>分享摘要 ↗</Link></div></header><DigestBody digest={digest}/></article>
    <aside className="reader-aside"><div className="reader-aside-inner"><h2>继续阅读</h2><Link className="text-link" href={'/search?date=' + digest.date}>检索本期材料 →</Link><Link className="text-link" href="/daily">日报归档 →</Link></div></aside>
  </main></AppShell>;
}
