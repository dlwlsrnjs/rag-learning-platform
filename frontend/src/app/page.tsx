import { LESSONS } from "@/lib/lessons";

export default function HomePage() {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <h1 style={{ margin: 0 }}>RAG을 눈으로 보고, 손으로 만들어 보세요</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 780, fontSize: 15 }}>
          단계별 튜토리얼을 따라가며 개념을 익히고, Flow 에디터로 파이프라인을 조립하고,
          청킹 전략을 비교하고, 자연어로 RAG 코드를 받아 보세요. 강의 현장과 자기학습 모두를
          염두에 두고 만들어졌습니다.
        </p>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>튜토리얼</h2>
          <span className="muted" style={{ fontSize: 13 }}>단계별 설명 + 인라인 실습</span>
          <span style={{ flex: 1 }} />
          <a href="/lessons" style={{ fontSize: 13 }}>전체 보기 →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {LESSONS.map((l) => (
            <a key={l.id} href={`/lessons/${l.id}`} className="panel" style={{
              display: "block", textDecoration: "none", color: "inherit",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span className={`badge ${l.level === "beginner" ? "badge-beginner" : "badge-intermediate"}`}>
                  {l.level === "beginner" ? "초급" : "중급"}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>{l.duration}</span>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{l.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{l.summary}</div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>도구</h2>
          <span className="muted" style={{ fontSize: 13 }}>자유롭게 실험할 때</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          <ToolCard href="/editor/flow" title="Flow Editor" desc="드래그로 파이프라인을 조립하고 실행합니다. 결정론적 Python 코드 생성 포함." />
          <ToolCard href="/editor" title="JSON Editor" desc="스펙 JSON을 직접 편집하는 파워 유저용." />
          <ToolCard href="/lab" title="실험실" desc="청킹·임베딩 랩, 전처리 퀴즈, LangGraph 툴 탐색 — 주제별 깊이 탐구." />
        </div>
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>설계 한 줄</h3>
        <p style={{ margin: 0 }}>
          모든 기능은 <strong>같은 파이프라인 스펙(JSON)</strong>을 공유합니다. Flow 편집 = 스펙 수정,
          실행 = 스펙 해석, 코드 생성 = 스펙 렌더링. 어떻게 만들든 결과가 일치합니다.
        </p>
      </section>
    </div>
  );
}

function ToolCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} className="panel" style={{
      display: "block", textDecoration: "none", color: "inherit",
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 12 }}>{desc}</div>
    </a>
  );
}
