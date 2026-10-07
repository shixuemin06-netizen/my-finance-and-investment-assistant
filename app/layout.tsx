import type { Metadata, Viewport } from 'next';
import './globals.css';
import './reading-refinements.css';


export const metadata: Metadata = {
  title: { default: '财经观点台账', template: '%s · 财经观点台账' },
  description: '本地运行、证据优先的个人财经观点研究台账',
  icons: { icon: '/reader/cutout-4-faa830732ac5.webp' },
};

export const viewport: Viewport = {
  themeColor: '#f6f9f8',
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
