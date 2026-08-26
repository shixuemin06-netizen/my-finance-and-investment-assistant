'use client';

import { useEffect, useState } from 'react';

type StatusData = { text: string; updatedAt: string | null };

/** 顶栏真实状态：从 /api/status 读取最新一次流水线运行状态 */
export default function JobStatus({ fallback }: { fallback?: string }) {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/status')
      .then((r) => r.json())
      .then((data: StatusData) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        /* 状态获取失败时回退默认文案 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const text = status?.text || fallback || '本地 · 私有';
  const isError = text.includes('失败') || text.includes('异常');

  return (
    <div className="top-bar-status">
      <span className={`live-dot${isError ? ' error' : ''}`} />
      <span>{text}</span>
    </div>
  );
}
