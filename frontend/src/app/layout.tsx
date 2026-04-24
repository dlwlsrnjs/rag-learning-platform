import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "SKKU RAG Lab",
  description: "검색 증강 생성(RAG)을 시각화·실험·학습하는 교육용 플랫폼",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <nav className="app-nav">
          <span className="skku-mark">SKKU</span>
          <span className="brand">RAG Lab</span>
          <span style={{ width: 8 }} />
          <a href="/">홈</a>
          <a href="/lessons" style={{ fontWeight: 700 }}>튜토리얼</a>
          <span className="divider">·</span>
          <a href="/editor/flow">Flow Editor</a>
          <a href="/editor">JSON</a>
          <a href="/lab">실험실</a>
          <span style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            성균관대 · RAG 학습 플랫폼
          </span>
        </nav>
        <main style={{ padding: "24px 24px 60px", maxWidth: 1280, margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
