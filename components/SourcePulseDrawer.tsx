'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SourcePulse } from '@/lib/types';
export default function SourcePulseDrawer() {
  const [data, setData] = useState<{ text: string; pulse: SourcePulse } | null>(null);
  useEffect(() => { let active = true; fetch('/api/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(v => { if (active) setData(v); }).catch(() => undefined); return () => { active = false; }; }, []);
  return <details className="source-drawer"><summary>内容状态 <span aria-hidden="true">↗</span></summary><div className="source-drawer-panel"><p className="drawer-status">{data?.text || '正在读取本地状态…'}</p>{data && <><div className="drawer-source-grid"><span>已入库 <b>{data.pulse.articleCount}</b></span><span>已摘要 <b>{data.pulse.summaryCount}</b></span><span>待摘要 <b>{data.pulse.pendingSummaryCount}</b></span><span>摘要服务 <b>{data.pulse.modelConfigured ? '已配置' : '未配置'}</b></span></div><p className="quiet-copy">本地保存材料与笔记；主动生成摘要时，文章内容会发送给当前配置的模型服务商。</p></>}<Link href="/review" className="text-link">运行与待办 →</Link></div></details>;
}
