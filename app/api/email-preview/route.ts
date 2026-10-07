import { emailBusinessDate, renderDigestEmail, type EmailFeed } from '@/lib/digest-email';
export const dynamic = 'force-dynamic';
const siteUrl = 'https://finance-research-shi.shixuemin06.chatgpt.site';
export async function GET() {
  try {
    const response = await fetch(siteUrl + '/assets/public-data.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Public reader unavailable');
    const feed = await response.json() as EmailFeed;
    const email = renderDigestEmail(feed, { businessDate: emailBusinessDate(), siteUrl });
    return new Response(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('邮件预览暂不可用，请稍后重试。定时配置仍可在运行管理查看。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
