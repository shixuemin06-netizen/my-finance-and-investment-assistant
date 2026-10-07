'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ResearchNote({ articleId, initialSaved = false, initialNote = '', initialHorizon = 'long' }: {
  articleId: number; initialSaved?: boolean; initialNote?: string; initialHorizon?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [note, setNote] = useState(initialNote);
  const [horizon, setHorizon] = useState(initialHorizon);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(nextSaved: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId, note, horizon, saved: nextSaved }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存失败');
      setSaved(nextSaved); setMessage(nextSaved ? '已保存到本机' : '已移出研究夹，笔记仍保留'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  }
  return <div className="research-note">
    <button className={saved ? 'save-link saved' : 'save-link'} onClick={() => saved ? setOpen(!open) : (setOpen(true), void save(true))} disabled={busy}>{saved ? '已加入研究夹 · 写笔记' : '＋ 加入研究夹'}</button>
    {open && <form className="note-editor" onSubmit={event => { event.preventDefault(); void save(true); }}>
      <label htmlFor={'horizon-' + articleId}>这条材料用来研究什么</label>
      <select id={'horizon-' + articleId} value={horizon} onChange={event => setHorizon(event.target.value)}>
        <option value="long">长期价值</option><option value="short">短期观察</option><option value="knowledge">知识积累</option>
      </select>
      <label htmlFor={'note-' + articleId}>我的判断与待验证问题</label>
      <textarea id={'note-' + articleId} value={note} onChange={event => setNote(event.target.value)} maxLength={4000} rows={4} placeholder="这改变了什么？依据是什么？什么证据会让我改变看法？" />
      <div className="note-actions"><button className="primary-button" disabled={busy}>{busy ? '保存中…' : '保存笔记'}</button><button type="button" className="text-button" onClick={() => setOpen(false)}>收起</button>{saved && <button type="button" className="text-button" onClick={() => void save(false)} disabled={busy}>移出研究夹</button>}</div>
      <small>笔记保存在本机，不发送给模型。</small>
    </form>}
    <span role="status" className="save-message">{message}</span>
  </div>;
}
