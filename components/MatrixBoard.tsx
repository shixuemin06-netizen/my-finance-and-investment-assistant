'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ArticleRow, SummaryRow } from '@/lib/types';
import { evidenceLabel } from '@/lib/evidence-labels';

function parseTags(value: string | null): string[] {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const PAGE_SIZE = 20;

export default function MatrixBoard({
  summaries,
  articles,
  initialTopic = '',
}: {
  summaries: SummaryRow[];
  articles: ArticleRow[];
  initialTopic?: string;
}) {
  const articleMap = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  const allTopics = useMemo(
    () => [...new Set(summaries.flatMap((s) => parseTags(s.tags)))],
    [summaries]
  );
  const [topic, setTopic] = useState<string>(initialTopic);
  useEffect(() => { setTopic(initialTopic); setPage(1); }, [initialTopic]);
  const [stance, setStance] = useState<string>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      if (stance && s.stance !== stance) return false;
      if (topic && !parseTags(s.tags).includes(topic)) return false;
      return true;
    });
  }, [summaries, topic, stance]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stanceLabel = (s: SummaryRow['stance']) =>
    s === 'bullish' ? '偏多' : s === 'bearish' ? '偏空' : '中性';

  return (
    <div>
      <div className="matrix-filters">
        <select value={topic} onChange={(e) => { setTopic(e.target.value); setPage(1); }}>
          <option value="">全部主题</option>
          {allTopics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={stance} onChange={(e) => { setStance(e.target.value); setPage(1); }}>
          <option value="">全部方向</option>
          <option value="bullish">偏多</option>
          <option value="bearish">偏空</option>
          <option value="neutral">中性</option>
        </select>
        <span className="matrix-count">{filtered.length} 条观点</span>
      </div>

      <section className="matrix-board">
        <div className="matrix-grid matrix-head">
          <span>作者 / 文章</span><span>涉及主题</span><span>方向</span><span>解析置信度</span><span>证据等级</span>
        </div>
        {pageItems.map((summary) => {
          const article = articleMap.get(summary.article_id);
          return (
            <article className="matrix-grid matrix-row" key={summary.id}>
              <div><strong>{article?.author || '未知作者'}</strong><small>{article?.title || '未命名文章'}</small></div>
              <div className="tag-row">{parseTags(summary.tags).slice(0, 3).map((tag) => <span className="dark-tag" key={tag}>{tag}</span>)}</div>
              <span className={`stance-pill ${summary.stance || 'neutral'}`}>{stanceLabel(summary.stance)}</span>
              <span className="confidence-value">{Math.round((summary.confidence ?? 0) * 100)}%</span>
              <span className="confidence-value">{evidenceLabel[summary.evidence_level || 'unverified']}</span>
            </article>
          );
        })}
        {!filtered.length && <div className="matrix-empty">暂无结构化观点</div>}
      </section>

      {pageCount > 1 && (
        <div className="matrix-pager">
          <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>上一页</button>
          <span>{safePage} / {pageCount}</span>
          <button onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage >= pageCount}>下一页</button>
        </div>
      )}
    </div>
  );
}
