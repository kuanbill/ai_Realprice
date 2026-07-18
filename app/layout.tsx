import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "實價登錄查詢" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
