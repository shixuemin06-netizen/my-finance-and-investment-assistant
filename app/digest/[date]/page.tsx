import db from '@/lib/db';
import DailyDigest from '@/components/DailyDigest';
import Link from 'next/link';
import type { DigestRow } from '@/lib/types';

export default async function DigestPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const digest = db
    .prepare('SELECT * FROM digests WHERE date = ?')
    .get(date) as DigestRow | undefined;

  if (!digest || !digest.full_content_md) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#EFEAE0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#1F1C18',
        fontFamily: '"Noto Sans SC", sans-serif',
      }}>
        <p style={{ color: '#656a63' }}>该日期没有日报。</p>
        <Link href="/archive" style={{ color: '#2B4C6F', fontSize: 14 }}>
          ← 返回归档
        </Link>
      </div>
    );
  }

  return <DailyDigest digest={digest} />;
}
