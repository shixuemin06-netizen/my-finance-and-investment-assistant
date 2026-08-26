import { NextResponse } from 'next/server';
import { getStatusLine } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getStatusLine();
  return NextResponse.json(status);
}
