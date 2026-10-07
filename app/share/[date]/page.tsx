import Link from 'next/link';
import db from '@/lib/db';
import ShareToolbar from '@/components/ShareToolbar';
import { evidenceLabel } from '@/lib/evidence';
import { getBriefItems, getSourcePulse } from '@/lib/research';
import type { DigestRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const digest = db.prepare('SELECT * FROM digests WHERE date = ?').get(date) as DigestRow | undefined;
  if (!digest) return <main className="share-empty"><h1>没有找到这期简报</h1><Link href="/archive">返回归档</Link></main>;
  const items = getBriefItems(date);
  const pulse = getSourcePulse(date);
  if (!items.length) return <main className="share-empty"><h1>本期还没有可分享的摘要</h1><p>{pulse.articleCount} 条材料已保存，{pulse.pendingSummaryCount} 条待摘要。</p><Link href={"/digest/" + date}>先阅读本期原文 →</Link><Link href={"/review?date=" + date}>处理待办 →</Link></main>;
  return <main className="share-page">
    <ShareToolbar />
    <section className="share-cover">
      <div className="share-brand"><span>SHI / PRIVATE RESEARCH</span><span>{date}</span></div>
      <p className="section-label">THE FINANCIAL LEDGER</p>
      <h1>本期重点材料</h1>
      <p>{pulse.summaryCount + " 条摘要 · " + (pulse.pendingSummaryCount ? "部分就绪，另有 " + pulse.pendingSummaryCount + " 条待摘要" : "请回到原文核验")}</p>
      <div className="share-cover-meta"><span>{digest.article_count ?? 0} 条冻结材料</span><span>{pulse.officialCount} 条官方材料</span><span>{pulse.pendingVerifyCount} 条待核验</span></div>
    </section>
    <section className="share-longform">
      <header><p className="section-label">EDITED SELECTION</p><h2>本期编辑选择</h2><p>证据等级描述来源结构，不代替投资建议或人工事实核验。</p></header>
      <div className="share-stories">{items.map((item) => <article key={item.claimId}><div><span>0{item.position}</span><em className={`evidence-chip ${item.evidenceLevel}`}>{evidenceLabel[item.evidenceLevel]}</em></div><h3>{item.title}</h3><p>{item.summary}</p><small>材料：{item.supportSources.map((source) => source.name).join(' · ') || '待补充'}{item.originalUrl && <> · <a href={item.originalUrl}>原文</a></>}</small></article>)}</div>
      <footer>财经观点台账 · SHI · {date} · 本地生成；请以原始材料与正式披露为准。</footer>
    </section>
  </main>;
}