import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { EmptyState } from '@/components/StoryList';
import DigestBody from '@/components/DigestBody';
import { dailyArchive, formatDate } from '@/lib/reader';
import type { DigestRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const days = dailyArchive() as Array<DigestRow & { summary_count: number }>;
  const current = date ? days.find(day => day.date === date) : days[0];
  return <AppShell active="daily"><main className="single-page daily-page">
    <header className="page-heading"><p className="eyebrow">每日阅读 · 历史归档</p><h1>财经日报</h1></header>
    <div className="daily-grid"><nav className="daily-dates" aria-label="日报日期"><p className="eyebrow">历史期次</p>{days.map(day => <Link key={day.date} href={'/daily?date=' + day.date} className={current?.date === day.date ? 'active' : ''} aria-current={current?.date === day.date ? 'page' : undefined}><span>{day.date}</span>{day.date === days[0]?.date && <small>最新一期</small>}</Link>)}</nav>
      <section className="daily-preview">{current ? <article className="daily-report-sheet"><header className="reader-header"><p className="eyebrow">收录日期 · {current.date}</p><h2>{current.title || '财经日报'}</h2><div className="reader-meta"><span>更新于 {formatDate(current.generated_at, true)}</span><Link href={'/share/' + current.date}>分享摘要 ↗</Link></div></header><DigestBody digest={current}/></article> : <EmptyState title={date ? '该日期没有日报' : '还没有生成日报'} text="材料采集后会形成当期阅读档案。" href={date ? '/daily' : '/admin'} action={date ? '返回最新一期' : '查看更新状态'}/>}</section>
    </div>
  </main></AppShell>;
}
