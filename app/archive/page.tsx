import db from '@/lib/db';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import type { DigestRow } from '@/lib/types';

export default function ArchivePage() {
  const digests = db.prepare('SELECT * FROM digests ORDER BY date DESC LIMIT 90').all() as DigestRow[];

  return (
    <AppShell active="archive" eyebrow={`${digests.length} 份日报`}>
      <main className="sub-page">
        <header className="sub-page-header">
          <p className="section-label">ARCHIVE</p>
          <h1>历史归档</h1>
          <p>每天的判断都保留下来，方便回看当时的信息环境，而不是只记住事后的答案。</p>
        </header>

        <section className="archive-list">
          {digests.length ? digests.map((digest, index) => (
            <Link key={digest.id} href={`/digest/${digest.date}`} className="archive-row">
              <span className="archive-index">{String(index + 1).padStart(2, '0')}</span>
              <time>{digest.date}</time>
              <div>
                <h2>{digest.title || '财经日报'}</h2>
                <p>{digest.one_liner || '暂无一句话摘要'}</p>
              </div>
              <span className="archive-count">{digest.article_count ?? 0} 篇</span>
              <span className="archive-arrow">↗</span>
            </Link>
          )) : (
            <div className="empty-card"><span>00</span><h3>归档还是空的</h3><p>完成第一轮日报流水线后，历史版本会出现在这里。</p></div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
