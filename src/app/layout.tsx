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
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
