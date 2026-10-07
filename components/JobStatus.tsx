'use client';
import { useEffect, useState } from 'react';
import type { SourcePulse } from '@/lib/types';
type StatusData = { text: string; pulse: SourcePulse };
export default function JobStatus({ fallback }: { fallback?: string }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  useEffect(() => { let active = true; fetch('/api/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(v => { if (active) setStatus(v); }).catch(() => undefined); return () => { active = false; }; }, []);
  const ready = status?.pulse.contentState === 'ready' && !status.pulse.stale;
  return <div className="top-bar-status"><span className={'live-dot' + (ready ? '' : ' warning')} /><span>{status?.text || fallback || '本地阅读工作台'}</span></div>;
}
