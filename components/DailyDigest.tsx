import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppShell from './AppShell';
import type { DigestRow } from '@/lib/types';

export default function DailyDigest({ digest }: { digest: DigestRow }) {
  return (
    <AppShell active="today" eyebrow={`日报 · ${digest.date}`}>
      <main className="reader-page">
        <article className="reader-sheet">
          <header className="reader-header">
            <p className="section-label">DAILY DIGEST · {digest.date}</p>
            <h1>{digest.title || '财经日报'}</h1>
            {digest.one_liner && <p className="reader-deck">{digest.one_liner}</p>}
            <div className="reader-meta">
              <span>{digest.article_count ?? 0} 篇文章</span>
              <span>生成于 {new Date(digest.generated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
            </div>
          </header>
          <div className="digest-content reader-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{digest.full_content_md || ''}</ReactMarkdown>
          </div>
        </article>
        <aside className="reader-aside">
          <div className="reader-aside-inner">
            <p className="section-label">READING GUIDE</p>
            <h2>阅读提示</h2>
            <p>摘要帮助定位信息，原文链接才是事实依据。多空标签只表达文章方向，不构成投资建议。</p>
            <a className="primary-button" href="/">返回今日简报</a>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}
