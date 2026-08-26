import AppShell from '@/components/AppShell';
import MatrixBoard from '@/components/MatrixBoard';
import { readTable } from '@/lib/db';
import type { ArticleRow, DivergenceRow, SummaryRow } from '@/lib/types';

function parseTags(value: string | null): string[] {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

export default function MatrixPage() {
  const articles = readTable('articles') as ArticleRow[];
  const summaries = readTable('summaries') as SummaryRow[];
  const divergences = readTable('divergence') as DivergenceRow[];
  const topics = [...new Set(summaries.flatMap((summary) => parseTags(summary.tags)))].slice(0, 6);

  return (
    <AppShell active="matrix" eyebrow={`${summaries.length} 条观点`}>
      <main className="sub-page matrix-page">
        <header className="sub-page-header dark-header">
          <p className="section-label">OPINION MATRIX</p>
          <h1>观点矩阵</h1>
          <p>把作者、主题与方向放在同一张桌面上。「解析置信度」表示模型是否确定理解文章，「证据等级」表示内容是否经过官方或多源支持。</p>
        </header>

        <MatrixBoard summaries={summaries} articles={articles} />

        <section className="matrix-lower">
          <div className="dark-panel">
            <p className="section-label">TOPICS</p><h2>覆盖主题</h2>
            <div className="topic-cloud dark-cloud">{topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
          </div>
          <div className="dark-panel">
            <p className="section-label">ANALYSIS</p><h2>横向分析</h2>
            <p>{divergences.length ? '已有横向分析结果，可回到今日简报查看完整内容。' : '样本不足，尚未形成可比较的共识或分歧。'}</p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
