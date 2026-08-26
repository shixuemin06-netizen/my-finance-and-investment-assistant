import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppShell from './AppShell';
import type { ArticleRow, DigestRow, DivergenceRow, KeywordTrendRow, SummaryRow, SourceTier } from '@/lib/types';
import { selectTopInsights } from '@/lib/select';

const tierLabel: Record<SourceTier, string> = {
  official: '官方',
  media: '媒体',
  community: '社区',
};

function parseArticleIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const ids = JSON.parse(value);
    return Array.isArray(ids) ? ids.map(Number) : [];
  } catch {
    return [];
  }
}

type TodayDashboardProps = {
  digest?: DigestRow;
  articles: ArticleRow[];
  summaries: SummaryRow[];
  divergences: DivergenceRow[];
  trends: KeywordTrendRow[];
};

function safeTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const tags = JSON.parse(value);
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
}

function formatDate(value?: string | null) {
  const date = value ? new Date(`${value.slice(0, 10)}T12:00:00+08:00`) : new Date();
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

export default function TodayDashboard({
  digest,
  articles,
  summaries,
  divergences,
  trends,
}: TodayDashboardProps) {
  const articleMap = new Map(articles.map((article) => [article.id, article]));

  // 本期文章集合：优先读日报冻结的 article_ids，否则回退全部
  const digestArticleIds = parseArticleIds(digest?.article_ids ?? null);
  const scopedSummaries = digestArticleIds.length
    ? summaries.filter((s) => digestArticleIds.includes(s.article_id))
    : summaries;

  const topIds = selectTopInsights(articles, scopedSummaries, undefined, 3);
  const insights = topIds
    .map((id) => {
      const summary = summaries.find((s) => s.article_id === id);
      if (!summary) return null;
      return {
        summary,
        article: articleMap.get(id),
        tags: safeTags(summary.tags),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const uniqueAuthors = new Set(articles.map((item) => item.author).filter(Boolean)).size;
  const currentTrends = trends
    .filter((trend) => !digest?.date || trend.date === digest.date)
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  return (
    <AppShell active="today" eyebrow={digest ? `已生成 · ${digest.date}` : '等待首份日报'}>
      <main className="dashboard-page">
        <section className="dashboard-main">
          <div className="page-kicker">
            <span>{formatDate(digest?.date)}</span>
            <span className="rule" />
            <span>5分钟晨读</span>
          </div>

          <header className="dashboard-hero">
            <p className="section-label">TODAY&apos;S BRIEF</p>
            <h1>{digest ? '今天值得关注的三件事' : '你的第一份财经简报，从一篇文章开始'}</h1>
            <p className="hero-summary">
              {digest?.one_liner || '把文章放进收件箱，系统会整理观点、识别共识与分歧，并保留原文入口。'}
            </p>
          </header>

          <section className="metric-strip" aria-label="今日数据概览">
            <div><strong>{digest?.article_count ?? articles.length}</strong><span>篇文章</span></div>
            <div><strong>{summaries.length}</strong><span>条摘要</span></div>
            <div><strong>{uniqueAuthors}</strong><span>位作者</span></div>
            <div><strong>{currentTrends.length}</strong><span>个主题</span></div>
          </section>

          <section className="insight-list" aria-labelledby="insight-title">
            <div className="section-heading">
              <div>
                <p className="section-label">KEY INSIGHTS</p>
                <h2 id="insight-title">核心观点</h2>
              </div>
              {digest && <Link href={`/digest/${digest.date}`} className="text-link">阅读完整日报 →</Link>}
            </div>

            {insights.length ? insights.map(({ summary, article, tags }, index) => (
              <article className="insight-item" key={summary.id}>
                <div className={`insight-number ${summary.stance || 'neutral'}`}>{index + 1}</div>
                <div className="insight-body">
                  <div className="insight-meta">
                    <span>{article?.author || '未知作者'}</span>
                    <span>·</span>
                    <span>{summary.stance === 'bullish' ? '偏多' : summary.stance === 'bearish' ? '偏空' : '中性'}</span>
                    {article?.source_tier && (
                      <span className={`tier-tag ${article.source_tier}`}>{tierLabel[article.source_tier]}</span>
                    )}
                  </div>
                  <h3>{article?.title || `观点 ${index + 1}`}</h3>
                  <p>{summary.summary}</p>
                  <div className="insight-footer">
                    <div className="tag-row">
                      {tags.slice(0, 4).map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}
                    </div>
                    {article?.url && <a href={article.url} target="_blank" rel="noreferrer" className="evidence-link">查看原文 ↗</a>}
                  </div>
                </div>
              </article>
            )) : (
              <div className="empty-card">
                <span>01</span>
                <h3>还没有可展示的观点</h3>
                <p>导入文章并运行摘要流水线后，重点内容会出现在这里。</p>
                <Link href="/import" className="primary-button">添加第一篇文章</Link>
              </div>
            )}
          </section>

          <section className="difference-card">
            <div className="difference-title">
              <div>
                <p className="section-label">CONSENSUS &amp; DIVERGENCE</p>
                <h2>谁和谁意见不同</h2>
              </div>
              <Link href="/matrix" className="text-link">打开观点矩阵 →</Link>
            </div>
            {divergences[0]?.summary_md ? (
              <div className="difference-content digest-content compact-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{divergences[0].summary_md}</ReactMarkdown>
              </div>
            ) : (
              <p className="quiet-copy">当前样本还不足以形成可靠分歧。继续积累同主题、同期限的作者观点后再比较。</p>
            )}
          </section>
        </section>

        <aside className="dashboard-rail">
          <section className="rail-card summary-card">
            <p className="section-label">SOURCE STATUS</p>
            <h2>信源状态</h2>
            <p>{digest?.one_liner || '尚未生成日报。'}</p>
            <div className="rail-divider" />
            <dl className="mini-stats">
              <div><dt>数据日期</dt><dd>{digest?.date || '—'}</dd></div>
              <div><dt>最后生成</dt><dd>{digest?.generated_at ? new Date(digest.generated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}</dd></div>
            </dl>
          </section>

          <section className="rail-card">
            <div className="rail-title"><h2>今日主题</h2><span>{currentTrends.length}</span></div>
            <div className="topic-cloud">
              {currentTrends.length ? currentTrends.map((trend) => (
                <span key={`${trend.keyword}-${trend.date}`}>{trend.keyword}<small>{trend.count}</small></span>
              )) : <p className="quiet-copy">暂无关键词趋势</p>}
            </div>
          </section>

          <section className="rail-card inbox-card">
            <span className="inbox-mark">＋</span>
            <h2>发现一篇值得保留的文章？</h2>
            <p>放进本地收件箱，下一轮流水线会处理它。</p>
            <Link href="/import" className="primary-button">打开收件箱</Link>
          </section>
        </aside>
      </main>
    </AppShell>
  );
}
