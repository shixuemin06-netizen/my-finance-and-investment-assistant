import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '财经观点台账', template: '%s · 财经观点台账' },
  description: '本地运行、证据优先的个人财经观点研究台账',
};

export const viewport: Viewport = {
  themeColor: '#EFEAE0',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
