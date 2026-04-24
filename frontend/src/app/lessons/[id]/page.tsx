"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getLesson } from "@/lib/lessons";
import { StepRenderer, useLessonCtx } from "@/components/tutorial/Renderer";
import { ApiKeyInput } from "@/components/ApiKeyInput";

export default function LessonRunnerPage() {
  const params = useParams<{ id: string }>();
  const lesson = useMemo(() => getLesson(params.id), [params.id]);
  const ctx = useLessonCtx();
  const [idx, setIdx] = useState(0);

  if (!lesson) {
    return (
      <div className="panel">
        <h2>렛슨을 찾을 수 없습니다</h2>
        <p><a href="/lessons">목록으로 돌아가기</a></p>
      </div>
    );
  }

  const step = lesson.steps[idx];
  const atFirst = idx === 0;
  const atLast = idx === lesson.steps.length - 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
      {/* Sidebar */}
      <aside style={{ display: "grid", gap: 12, alignContent: "start", position: "sticky", top: 16 }}>
        <div>
          <a href="/lessons" className="muted" style={{ fontSize: 12 }}>← 목록</a>
          <h3 style={{ margin: "6px 0 0" }}>{lesson.title}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{lesson.duration}</div>
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {lesson.steps.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => setIdx(i)}
                style={{
                  width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6,
                  background: i === idx ? "var(--accent-soft)" : "transparent",
                  color: "var(--text)",
                  border: `1.5px solid ${i === idx ? "var(--accent-dark)" : "var(--border)"}`,
                  fontWeight: i === idx ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                <span className="mono" style={{
                  fontSize: 11, marginRight: 6, color: i === idx ? "var(--accent-dark)" : "var(--muted)",
                }}>{i + 1}.</span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
        <div className="panel" style={{ padding: 10 }}>
          <ApiKeyInput />
        </div>
      </aside>

      {/* Main */}
      <main style={{ display: "grid", gap: 16 }}>
        <header>
          <div className="muted" style={{ fontSize: 12 }}>
            단계 {idx + 1} / {lesson.steps.length}
          </div>
          <h2 style={{ margin: "4px 0 0" }}>{step.title}</h2>
        </header>

        <section className="panel" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
          {step.explanation}
        </section>

        <section className="panel" style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>실습</div>
          <StepRenderer render={step.render} ctx={ctx} />
        </section>

        <nav style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
          <button
            disabled={atFirst}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="btn-secondary"
          >
            ← 이전
          </button>
          {atLast ? (
            <a href="/lessons"><button>전체 렛슨 보기 →</button></a>
          ) : (
            <button onClick={() => setIdx((i) => Math.min(lesson.steps.length - 1, i + 1))}>
              다음 →
            </button>
          )}
        </nav>
      </main>
    </div>
  );
}
