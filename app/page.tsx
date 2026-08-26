import db from '@/lib/db';
import TodayDashboard from '@/components/TodayDashboard';
import { readTable } from '@/lib/db';
import type { ArticleRow, DigestRow, DivergenceRow, KeywordTrendRow, SummaryRow } from '@/lib/types';

export default function Home() {
  const digest = db
    .prepare('SELECT * FROM digests ORDER BY date DESC LIMIT 1')
    .get() as DigestRow | undefined;

  return (
    <TodayDashboard
      digest={digest}
      articles={(readTable('articles') as ArticleRow[]).sort((a, b) => b.id - a.id)}
      summaries={(readTable('summaries') as SummaryRow[]).sort((a, b) => b.id - a.id)}
      divergences={(readTable('divergence') as DivergenceRow[]).sort((a, b) => b.id - a.id)}
      trends={readTable('keywords_trend') as KeywordTrendRow[]}
    />
  );
}
