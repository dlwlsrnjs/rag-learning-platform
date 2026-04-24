"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type CodingTask = {
  id: string;
  label: string;
  pattern: RegExp;
  hint: string;
};

export type LineHint = {
  line: number; // 1-indexed
  text: string;
};

export type CodingExerciseProps = {
  intro?: ReactNode;
  starterCode: string;
  tasks: CodingTask[];
  lineHints: LineHint[];
  storageKey?: string; // optional — persist user code in localStorage
};

export function CodingExercise({
  intro, starterCode, tasks, lineHints, storageKey,
}: CodingExerciseProps) {
  const [code, setCode] = useState(starterCode);
  const [shownHints, setShownHints] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<{ line: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load saved code once.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setCode(saved);
    } catch {}
  }, [storageKey]);

  // Persist on change.
  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, code); } catch {}
  }, [code, storageKey]);

  const taskStatus = useMemo(
    () => tasks.map((t) => ({ ...t, ok: t.pattern.test(code) })),
    [code, tasks],
  );
  const doneCount = taskStatus.filter((t) => t.ok).length;
  const allDone = doneCount === tasks.length;

  const lines = useMemo(() => starterCode.split("\n"), [starterCode]);
  const hintByLine = useMemo(() => {
    const m = new Map<number, string>();
    lineHints.forEach((h) => m.set(h.line, h.text));
    return m;
  }, [lineHints]);

  function onReset() {
    setCode(starterCode);
    setShownHints(new Set());
  }

  function toggleHint(id: string) {
    setShownHints((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const progressPct = (doneCount / Math.max(tasks.length, 1)) * 100;

  return (
    <div style={{ display: "grid", gap: 14 }} ref={containerRef}>
      {intro && (
        <div style={{ fontSize: 14 }}>{intro}</div>
      )}

      {/* Progress bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", background: "var(--panel-alt)",
        borderRadius: 8, border: "1px solid var(--border)",
      }}>
        <div style={{ fontWeight: 600 }}>
          진행 {doneCount} / {tasks.length}
          {allDone && <span style={{ color: "var(--accent-dark)", marginLeft: 8 }}>🎉 모두 완료!</span>}
        </div>
        <div style={{ flex: 1, height: 6, background: "#e0e6e2", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${progressPct}%`, height: "100%",
            background: allDone ? "var(--accent-dark)" : "var(--accent)",
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", gap: 14 }}>
        {/* Reference code with line hover */}
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <strong>참고 코드</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              각 줄에 마우스를 올리면 설명이 나타납니다
            </span>
          </div>
          <div style={{ display: "flex", fontFamily: "var(--mono)", fontSize: 12.5 }}>
            {/* gutter */}
            <div style={{
              padding: "10px 8px", background: "var(--panel-alt)",
              borderRight: "1px solid var(--border)",
              color: "var(--muted)", textAlign: "right", userSelect: "none",
              minWidth: 36,
            }}>
              {lines.map((_, i) => <div key={i} style={{ lineHeight: "1.55" }}>{i + 1}</div>)}
            </div>
            {/* code */}
            <div style={{ padding: "10px 12px", overflow: "auto", flex: 1, position: "relative" }}>
              {lines.map((line, i) => {
                const lineNum = i + 1;
                const hint = hintByLine.get(lineNum);
                return (
                  <span
                    key={i}
                    className={`code-line${hint ? " has-hint" : ""}`}
                    onMouseEnter={(e) => {
                      if (!hint || !containerRef.current) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const hostRect = containerRef.current.getBoundingClientRect();
                      setHovered({
                        line: lineNum,
                        x: rect.right - hostRect.left + 12,
                        y: rect.top - hostRect.top,
                      });
                    }}
                    onMouseLeave={() => setHovered(null)}
                    style={{ lineHeight: "1.55" }}
                  >
                    {highlightBlanks(line)}
                    {line.length === 0 ? " " : ""}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Task checklist */}
        <div className="panel" style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <strong>과제 체크리스트</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            아래 빈칸을 채우면 자동으로 ✓ 체크됩니다.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {taskStatus.map((t, i) => (
              <div key={t.id} style={{
                padding: 10, borderRadius: 8,
                border: `1px solid ${t.ok ? "var(--accent)" : "var(--border)"}`,
                background: t.ok ? "var(--accent-soft)" : "var(--panel)",
                transition: "all 0.2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 20, height: 20, minWidth: 20, borderRadius: 10,
                    background: t.ok ? "var(--accent)" : "transparent",
                    border: t.ok ? "none" : "1.5px solid var(--muted)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: "#0f2418", fontSize: 12, fontWeight: 800,
                  }}>
                    {t.ok ? "✓" : i + 1}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 13,
                    textDecoration: t.ok ? "line-through" : "none",
                    color: t.ok ? "var(--muted)" : "var(--text)",
                  }}>
                    {t.label}
                  </span>
                  {!t.ok && (
                    <button
                      className="btn-secondary"
                      onClick={() => toggleHint(t.id)}
                      style={{ fontSize: 11, padding: "3px 10px" }}
                    >
                      {shownHints.has(t.id) ? "닫기" : "힌트"}
                    </button>
                  )}
                </div>
                {shownHints.has(t.id) && !t.ok && (
                  <div style={{
                    marginTop: 8, padding: "8px 10px", borderRadius: 6,
                    background: "var(--panel-alt)", fontSize: 12.5,
                    color: "var(--text)", lineHeight: 1.5,
                  }}>
                    💡 {t.hint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <strong>여러분의 코드</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            편집할 때마다 오른쪽 체크리스트가 실시간으로 업데이트됩니다
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onReset} style={{ fontSize: 11, padding: "4px 10px" }}>
            처음으로 되돌리기
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={Math.max(16, lines.length + 2)}
          style={{
            width: "100%", padding: "12px 14px",
            border: "none", outline: "none", resize: "vertical",
            fontFamily: "var(--mono)", fontSize: 13, lineHeight: "1.55",
            background: "transparent", color: "var(--text)",
            borderRadius: 0,
          }}
        />
      </div>

      {/* Floating tooltip for hovered reference line */}
      {hovered && hintByLine.get(hovered.line) && (
        <div
          className="code-tooltip"
          style={{
            left: hovered.x,
            top: hovered.y,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.85, marginBottom: 2 }}>
            Line {hovered.line}
          </div>
          {hintByLine.get(hovered.line)}
        </div>
      )}
    </div>
  );
}

/** Highlight ___BLANK___ placeholders so learners see what to fill. */
function highlightBlanks(line: string): ReactNode {
  const parts = line.split(/(___[A-Z0-9_]+___)/g);
  return parts.map((p, i) => {
    if (/^___[A-Z0-9_]+___$/.test(p)) {
      return (
        <span key={i} style={{
          background: "#fff2d1",
          color: "#8a5a00",
          borderRadius: 3,
          padding: "0 3px",
          border: "1px dashed #e0b85a",
          fontWeight: 700,
        }}>
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
