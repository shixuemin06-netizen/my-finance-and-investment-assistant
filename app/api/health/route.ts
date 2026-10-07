import db from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    db.prepare('SELECT 1').get();
    return Response.json({ app: 'finance-ledger', instance: process.env.FINANCE_INSTANCE || null, database: 'ok', pid: process.pid, parentPid: process.ppid });
  } catch { return Response.json({ app: 'finance-ledger', database: 'unavailable' }, { status: 503 }); }
}
