'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

type InboxItem = { id: number; title: string | null; url: string; source_note: string | null; status: string; staged_at: string };
export default function Inbox({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!url.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), note: note.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus('done');
        setMessage(`已加入资料库：「${data.title}」`);
        setUrl('');
        setNote('');
        router.refresh();
      } else {
        setStatus('error');
        setMessage(data.error || '导入失败');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '网络错误');
    }
  };

  return (
    <AppShell active="import" eyebrow="本地收件箱">
      <main className="sub-page import-page">
        <header className="sub-page-header">
          <p className="section-label">PERSONAL INBOX</p>
          <h1>添加材料</h1>
          <p>保存原始链接与正文后，即可在资料库检索和阅读。近期材料的摘要按现有模型预算处理。</p>
        </header>

        <div className="import-layout">
          <form className="import-card" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="article-url">文章链接</label>
              <input id="article-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://mp.weixin.qq.com/s/..." />
              <small>支持普通网页和可直接访问的微信公众号链接。</small>
            </div>
            <div className="field-group">
              <label htmlFor="article-note">为什么留下它？</label>
              <textarea id="article-note" value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="例如：关于地产政策的判断与昨天相反，值得跟踪。" />
              <small>备注不会交给模型改写，方便日后回忆收藏原因。</small>
            </div>
            <button type="submit" className="primary-button submit-button" disabled={status === 'loading' || !url.trim()}>
              {status === 'loading' ? '正在抓取…' : '存入本地收件箱'}
            </button>
            {message && <div role={status==='error'?'alert':'status'} className={`form-message ${status}`}>{message}</div>}
          </form>

          <aside className="import-guide">
            <p className="section-label">HOW IT WORKS</p>
            <h2>这篇文章会经历什么</h2>
            <ol>
              <li><span>01</span><div><strong>抓取与暂存</strong><p>保存标题、正文和原始链接。</p></div></li>
              <li><span>02</span><div><strong>统一分析</strong><p>入库后即可阅读，模型按预算生成摘要与标签。</p></div></li>
              <li><span>03</span><div><strong>进入比较</strong><p>检索同主题材料，回到原文核对具体判断。</p></div></li>
            </ol>
            <p className="privacy-note"><span className="live-dot" />材料存储在本地；生成摘要时会发送文章正文给你配置的模型服务商。备注不会发送。</p>
          </aside>
        </div>
        <section className="inbox-history"><div className="section-heading"><h2>最近收下的材料</h2><a className="text-link" href="/review">整理与处理 →</a></div>
          {items.length ? items.map(item => <article key={item.id}><span className="topic-label">{item.staged_at.slice(0,10)} · {item.status === 'pending' ? '等待入库' : item.status === 'merged' ? '已入库' : '未再次入库（重复或正文不足）'}</span><h3><a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url} ↗</a></h3>{item.source_note && <p>收藏原因：{item.source_note}</p>}</article>) : <p className="quiet-copy">还没有手动收下的材料。粘贴一条原文链接试试。</p>}
        </section>
      </main>
    </AppShell>
  );
}
