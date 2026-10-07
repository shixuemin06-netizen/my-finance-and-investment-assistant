import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { deliverySettings } from '@/lib/automation-settings';
export const dynamic = 'force-dynamic';
export default function Page() {
  const settings = deliverySettings();
  return <AppShell active="admin"><main className="single-page"><header className="page-heading"><p className="eyebrow">运行与设置</p><h1>邮件日报</h1></header>
    <section className="admin-panel"><dl><dt>定时任务</dt><dd>{settings?.enabled ? '已启用 · 云端运行' : '尚未启用'}</dd><dt>发送时间</dt><dd>{settings ? `${settings.time} · 北京时间` : '08:00 · 北京时间'}</dd><dt>收件邮箱</dt><dd>{settings?.recipient || '尚未设置'}</dd><dt>送达记录</dt><dd>以邮箱中的已发送回执为准</dd></dl>
      <p className="quiet-copy">每天最多投递一份。资料包含实际发布日期、来源入口与阅读链接；来源未更新时会标明历史收录。</p>
      <a className="text-link" href="/api/email-preview" target="_blank" rel="noreferrer">预览今日邮件 →</a>
    </section><p><Link className="text-link" href="/admin">返回运行管理 →</Link></p></main></AppShell>;
}
