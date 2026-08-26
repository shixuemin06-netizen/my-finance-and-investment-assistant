import Link from 'next/link';
import type { ReactNode } from 'react';
import JobStatus from './JobStatus';

type AppShellProps = {
  children: ReactNode;
  active?: 'today' | 'matrix' | 'archive' | 'import';
  eyebrow?: string;
};

const navItems = [
  { key: 'today', href: '/', label: '今日简报' },
  { key: 'matrix', href: '/matrix', label: '观点矩阵' },
  { key: 'archive', href: '/archive', label: '历史归档' },
  { key: 'import', href: '/import', label: '文章收件箱' },
] as const;

export default function AppShell({ children, active = 'today', eyebrow }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <Link href="/" className="brand-mark" aria-label="财经观点台账首页">
          <span className="brand-symbol">观</span>
          <span>
            <strong>财经观点台账 <span className="owner-tag">SHI</span></strong>
            <small>SHI · 私人研究台</small>
          </span>
        </Link>

        <nav className="side-nav-links" aria-label="主导航">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? 'nav-link active' : 'nav-link'}
            >
              <span className="nav-index">0{navItems.indexOf(item) + 1}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="side-nav-foot">
          <span className="live-dot" />
          <div>
            <strong>本地运行</strong>
            <small>数据仅保存在这台设备</small>
          </div>
        </div>
      </aside>

      <div className="app-stage">
        <header className="top-bar">
          <Link href="/" className="mobile-brand">财经观点台账</Link>
          <nav className="mobile-nav" aria-label="移动端导航">
            {navItems.map((item) => (
              <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                {item.label}
              </Link>
            ))}
          </nav>
          <JobStatus fallback={eyebrow || '本地 · 私有'} />
        </header>
        {children}
      </div>
    </div>
  );
}
