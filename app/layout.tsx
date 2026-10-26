import type { Metadata } from "next";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

export const metadata: Metadata = {
  title: "紫微命盘 · 出生档案与命盘阅读",
  description: "基于 iztro 的紫微斗数命盘，支持公历与农历输入、十二宫查看和解读报告流程。",
  icons: { icon: "/icon.svg" }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
