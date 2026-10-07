import Link from 'next/link';
import type { SourcePulse } from '@/lib/types';
import { contentLabels } from '@/lib/delivery';
export default function SourcePulseCard({ pulse, title = '本期进度' }: { pulse: SourcePulse; title?: string }) {
  return <section className="source-pulse-card" aria-label="内容状态">
    <div className="card-kicker-row"><p className="section-label">EDITION STATUS</p><span className={'status-chip ' + (pulse.contentState === 'ready' && !pulse.stale ? 'success' : 'partial')}>{contentLabels[pulse.contentState]}</span></div>
    <h2>{title}</h2><p className="pulse-caption">{pulse.digestDate || '暂无日报'}{pulse.stale ? ' · 不是今日内容' : ''}</p>
    <div className="source-mix"><span>材料 <b>{pulse.articleCount}</b></span><span>摘要 <b>{pulse.summaryCount}</b></span><span>待摘要 <b>{pulse.pendingSummaryCount}</b></span></div>
    <div className="pulse-actions"><span className="quiet-count">已摘要不等于已核验</span><Link href="/review" className="text-link">处理待办 →</Link></div>
    <p className="pending-source-note">{pulse.modelConfigured ? '摘要服务已配置，按需生成。' : '摘要服务未配置；原文与研究夹可用。'}</p>
  </section>;
}
