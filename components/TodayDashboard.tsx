import Link from 'next/link';
import HotTopics from './HotTopics';
import ResearchFocus from './ResearchFocus';
import AppShell from './AppShell';
import SourcePulseCard from './SourcePulseCard';
import { evidenceLabel } from '@/lib/evidence-labels';
import type { ArticleRow, BriefItem, SourcePulse } from '@/lib/types';

export default function TodayDashboard({ pulse, briefItems, readableDate, recent, total, saved }: {
  pulse: SourcePulse; briefItems: BriefItem[]; readableDate: string | null; recent: ArticleRow[]; total: number; saved: number;
}) {
  return <AppShell active="today"><main className="dashboard-page reading-desk">
    <section className="dashboard-main">
      <header className="desk-hero"><p className="section-label">YOUR DAILY RESEARCH DESK</p><h1>把信息读薄，<br className="mobile-break" />把判断留下。</h1><p>从新闻到理解，从一条材料到一个持续跟踪的问题。</p></header>
      <form action="/matrix" className="desk-search"><label htmlFor="desk-query" className="sr-only">搜索财经材料</label><span aria-hidden="true">⌕</span><input id="desk-query" name="q" type="search" placeholder="今天，想弄懂什么？" maxLength={120} /><button type="submit">搜索材料 ↗</button></form>
      <div className="desk-stats"><span><b>{total}</b> 本地材料</span><Link href="/notebook"><b>{saved}</b> 研究收藏</Link><span>原文可追溯 · 笔记留在本机</span></div>
      {(pulse.stale || pulse.contentState !== 'ready') && <section className="freshness-notice" aria-label="本期内容进度"><span className="notice-dot" /><div><strong>{pulse.digestDate ? '最近一期 ' + pulse.digestDate : '从第一条材料开始'}{pulse.stale ? ' · 今日尚未更新' : ''}</strong><p>{pulse.pendingSummaryCount ? pulse.pendingSummaryCount + ' 条材料待摘要。你仍可以阅读原文，或继续阅读最近有摘要的一期。' : '可以获取最新材料，或从收件箱导入你关注的原文。'}</p></div><Link href="/review">处理待办 →</Link></section>}
      <div className="daily-entry"><div><span className="section-label">DAILY EDITION</span><h2>财经日报 · {pulse.digestDate || '尚未创建'}</h2><p>本期 {pulse.articleCount} 条材料，{pulse.summaryCount} 条已生成摘要。保留原文、判断与阅读进度。</p></div><Link href="/daily" className="primary-button">打开日报 →</Link></div>
      <ResearchFocus />
      <section className="brief-section" aria-labelledby="brief-title">
        <div className="section-heading"><div><p className="section-label">SELECTED READING</p><h2 id="brief-title">值得细读 <span className="edition-date">{readableDate || '等待材料'}</span></h2></div>{readableDate && <Link href={'/digest/' + readableDate} className="text-link">阅读这一期 →</Link>}</div>
        {briefItems.length ? <div className="editorial-stories">{briefItems.map((item, index) => <article className={'editorial-story ' + (index === 0 ? 'lead-story' : '')} key={item.claimId}>
          <div className="story-topline"><span className="brief-number">{String(index + 1).padStart(2, '0')}</span><span className={'evidence-chip ' + item.evidenceLevel}>{evidenceLabel[item.evidenceLevel]}</span><span className="story-topic">{item.topic}</span></div>
          <h3><a href={item.originalUrl || '/matrix'} target={item.originalUrl ? '_blank' : undefined} rel="noreferrer">{item.title}</a></h3><p className="story-summary">{item.summary}</p>
          <div className="story-footer"><span>{item.supportSources[0]?.name || '来源待补'} · 模型摘要，未人工核验</span><a href={item.originalUrl || '/matrix'} target="_blank" rel="noreferrer" className="evidence-link">核对原文 ↗</a></div>
        </article>)}</div> : <div className="empty-card"><h3>原文先到，摘要随后</h3><p>暂时没有可用摘要。下方展示已保存的材料，阅读与收藏不需要模型密钥。</p><Link className="secondary-button" href="/matrix">先读原文 →</Link></div>}
      </section>
      <section className="recent-section"><div className="section-heading"><div><p className="section-label">RECENTLY COLLECTED</p><h2>最新入库</h2></div><Link className="text-link" href="/matrix">全部材料 →</Link></div>
        <p className="quiet-copy">按保存顺序排列，不代表新闻发生时间。</p>
        <div className="recent-list">{recent.map(article => <article key={article.id}><div><span>{article.publisher || article.author || '来源待补'}</span><time>{article.published_at?.slice(0, 10) || '收录 ' + article.fetched_at.slice(0,10)}</time></div><h3><a href={article.url} target="_blank" rel="noreferrer">{article.title} ↗</a></h3></article>)}</div>
      </section>
    </section>
    <aside className="dashboard-rail">
      <HotTopics />
      <SourcePulseCard pulse={pulse} />
      <section className="research-invitation"><p className="section-label">MAKE IT YOURS</p><span className="notebook-emblem" aria-hidden="true">观 / 记</span><h2>消息会过去，<br />问题值得留下。</h2><p>留下一条判断，记住它的依据。把长期价值、短期观察和知识积累分开整理。</p><Link href="/notebook" className="secondary-button">打开我的研究夹 →</Link></section>
      <section className="rail-reading-path"><p className="section-label">A SMALL DAILY PRACTICE</p><ol><li><b>读到变化</b><span>用简报缩小阅读范围</span></li><li><b>回到原文</b><span>区分事实与文章观点</span></li><li><b>留下问题</b><span>记录依据、反证与下一步</span></li></ol><Link href="/import" className="text-link">＋ 收下一条新材料</Link></section>
    </aside>
  </main></AppShell>;
}
