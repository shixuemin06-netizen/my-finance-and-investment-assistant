'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';

export default function ImportPage() {
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
        setMessage(`已存入暂存区：「${data.title}」`);
        setUrl('');
        setNote('');
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
          <h1>先收藏，后判断</h1>
          <p>把临时看到的财经文章放在这里。系统先保存原文，下一轮流水线再统一摘要和比较，不打乱今天的阅读节奏。</p>
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
            {message && <div className={`form-message ${status}`}>{message}</div>}
          </form>

          <aside className="import-guide">
            <p className="section-label">HOW IT WORKS</p>
            <h2>这篇文章会经历什么</h2>
            <ol>
              <li><span>01</span><div><strong>抓取与暂存</strong><p>保存标题、正文和原始链接。</p></div></li>
              <li><span>02</span><div><strong>统一分析</strong><p>在下一轮流水线中生成摘要与标签。</p></div></li>
              <li><span>03</span><div><strong>进入比较</strong><p>与同主题文章一起判断共识和分歧。</p></div></li>
            </ol>
            <p className="privacy-note"><span className="live-dot" />所有内容只写入本地数据目录。</p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
