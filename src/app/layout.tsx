import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NormScale | 工业质量证明书智能合规核验引擎与决策看板',
  description: '基于国家/行业执行标准的工业质保书确定性核验、规则切片比对与人机协同验收系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-screen w-screen overflow-hidden bg-bg-slate-mist dark:bg-bg-industrial-slate text-on-surface font-body-md antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
