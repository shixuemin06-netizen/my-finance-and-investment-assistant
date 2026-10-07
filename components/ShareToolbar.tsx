'use client';

import { useState } from 'react';

export default function ShareToolbar() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.print();
    }
  };
  return <div className="share-toolbar"><a href="/">返回研究台</a><button onClick={copy}>{copied ? '链接已复制' : '复制本地链接'}</button><button className="share-print" onClick={() => window.print()}>打印 / 导出 PDF</button></div>;
}