"use client";

import { useEffect, useState } from "react";
import { streamNDJSON, type StreamEvent } from "@/lib/stream";
import { useApiKey } from "@/lib/useApiKey";
import { LoadingOverlay, useStreamOverlay } from "@/components/LoadingOverlay";

export type PyRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  syntax_error: boolean;
};

export function CodeEditorAndRun({
  title,
  subtitle,
  initialCode,
}: {
  title: string;
  subtitle?: string;
  initialCode: string;
}) {
  const [apiKey] = useApiKey();
  const { run: runWithOverlay, overlayProps } = useStreamOverlay();

  const [code, setCode] = useState(initialCode);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<PyRunResult | null>(null);

  // Sync to fresh generated code only while user hasn't edited.
  useEffect(() => {
    if (!dirty) setCode(initialCode);
  }, [initialCode, dirty]);

  function onEdit(newCode: string) {
    setCode(newCode);
    setDirty(true);
  }

  function revert() {
    setCode(initialCode);
    setDirty(false);
    setEditing(false);
  }

  async function onRun() {
    setResult(null);
    const stream = streamNDJSON<StreamEvent>("/api/run-python/stream", {
      code,
      api_key: apiKey || null,
      timeout: 60,
    });
    const res = await runWithOverlay<PyRunResult>("Python 실행", stream, { autoCloseMs: 1200 });
    if (res.result) {
      setResult(res.result);
    } else if (res.error) {
      setResult({
        ok: false,
        stdout: "",
        stderr: res.error,
        exit_code: null,
        duration_ms: 0,
        syntax_error: false,
      });
    }
  }

  return (
    <div className="panel" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {subtitle && <span className="muted" style={{ fontSize: 12 }}>{subtitle}</span>}
        {dirty && (
          <span className="badge" style={{
            background: "#fff2d1", color: "#8a5a00", border: "1px solid #e0b85a",
          }}>
            수정됨
          </span>
        )}
        <span style={{ flex: 1 }} />
        {dirty && (
          <button
            className="btn-secondary"
            onClick={revert}
            style={{ fontSize: 12, padding: "4px 10px" }}
            title="수정 내용을 버리고 생성 코드로 되돌립니다"
          >
            ↺ 원본으로
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={() => setEditing((v) => !v)}
          style={{ fontSize: 12, padding: "4px 12px" }}
        >
          {editing ? "👁 보기" : "✎ Edit"}
        </button>
        <button
          onClick={onRun}
          style={{ fontSize: 12, padding: "4px 16px", fontWeight: 700 }}
        >
          ▶ Run
        </button>
      </div>

      {!apiKey && code.includes("OPENAI_API_KEY") && (
        <div style={{
          padding: "6px 10px", fontSize: 12, borderRadius: 6,
          background: "#fff6e5", border: "1px solid #e5c680",
        }}>
          ⚠ 코드가 <code>OPENAI_API_KEY</code>를 참조합니다. 상단에 키를 입력해 두면 실행 시 자동으로 환경변수로 전달됩니다.
        </div>
      )}

      {editing ? (
        <textarea
          value={code}
          onChange={(e) => onEdit(e.target.value)}
          spellCheck={false}
          rows={Math.min(28, Math.max(12, code.split("\n").length + 1))}
          style={{
            width: "100%",
            fontFamily: "var(--mono)",
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        />
      ) : (
        <pre style={{ margin: 0, fontSize: 12, maxHeight: 500, overflow: "auto" }}>{code}</pre>
      )}

      {result && <OutputPanel result={result} />}

      <LoadingOverlay {...overlayProps} />
    </div>
  );
}

function OutputPanel({ result }: { result: PyRunResult }) {
  const statusLabel = result.syntax_error
    ? "✗ 문법 오류 — 실행되지 않았습니다"
    : result.ok
    ? "✓ 정상 종료"
    : result.exit_code != null
    ? `✗ 실패 (exit=${result.exit_code})`
    : "✗ 실행 실패";
  const color = result.ok ? "var(--accent-dark)" : "var(--err)";

  // Exit code 0 with non-empty stderr = warnings/deprecation notices, not failures.
  // Style them as yellow info, not red errors.
  const stderrIsWarning = result.ok && !!result.stderr;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: result.ok ? "var(--accent-soft)" : "#fce9e9",
        borderRadius: 8,
        borderLeft: `4px solid ${color}`,
        fontSize: 13,
      }}>
        <strong style={{ color }}>{statusLabel}</strong>
        {stderrIsWarning && (
          <span className="muted" style={{ fontSize: 11 }}>
            (stderr에 경고 메시지가 있지만 실행은 성공)
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted mono" style={{ fontSize: 11 }}>
          {result.duration_ms.toFixed(0)} ms
        </span>
      </div>
      {result.stdout && (
        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>stdout</div>
          <pre style={{
            margin: 0, fontSize: 12, maxHeight: 280, overflow: "auto",
            background: "var(--panel-alt)",
          }}>{result.stdout}</pre>
        </div>
      )}
      {result.stderr && (
        <div>
          <div style={{
            fontSize: 11, marginBottom: 4,
            color: stderrIsWarning ? "#8a5a00" : "var(--err)",
          }}>
            {stderrIsWarning ? "⚠ stderr (경고 · 실행에 영향 없음)" : "stderr"}
          </div>
          <pre style={{
            margin: 0, fontSize: 12, maxHeight: 280, overflow: "auto",
            color: stderrIsWarning ? "#5a3f00" : "var(--err)",
            background: stderrIsWarning ? "#fff6e5" : "#fce9e9",
            border: `1px solid ${stderrIsWarning ? "#e0b85a" : "var(--err)"}`,
          }}>{result.stderr}</pre>
        </div>
      )}
    </div>
  );
}
