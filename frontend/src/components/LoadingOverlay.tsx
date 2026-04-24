"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamEvent } from "@/lib/stream";

export type LogEntry = {
  time: number; // ms since epoch
  event: StreamEvent;
};

export function LoadingOverlay({
  open, title, logs, busy, startedAt, onClose, errorMessage,
}: {
  open: boolean;
  title: string;
  logs: LogEntry[];
  busy: boolean;
  startedAt: number | null;
  onClose: () => void;
  errorMessage?: string | null;
}) {
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll logs to bottom.
  useEffect(() => {
    if (!logBoxRef.current) return;
    logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs]);

  // Escape closes when not busy.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 100) / 10 : 0;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(30, 42, 36, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 300, padding: 20,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          borderRadius: 14,
          border: "1.5px solid var(--accent)",
          maxWidth: 640, width: "100%",
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 12px 40px rgba(30, 42, 36, 0.25)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--accent-soft)",
          borderRadius: "12px 12px 0 0",
        }}>
          {busy ? (
            <div
              style={{
                width: 20, height: 20, borderRadius: 10,
                border: "3px solid var(--accent-soft)",
                borderTopColor: "var(--accent-dark)",
                animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
          ) : errorMessage ? (
            <span style={{ fontSize: 18 }}>⚠</span>
          ) : (
            <span style={{ fontSize: 18 }}>✓</span>
          )}
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <span className="muted mono" style={{ fontSize: 11 }}>
            {elapsed.toFixed(1)}s
          </span>
          <span style={{ flex: 1 }} />
          {!busy && (
            <button onClick={onClose} className="btn-secondary"
              style={{ fontSize: 12, padding: "3px 10px" }}>닫기</button>
          )}
        </div>

        {/* Logs */}
        <div
          ref={logBoxRef}
          style={{
            padding: "10px 14px",
            overflow: "auto",
            flex: 1,
            minHeight: 220,
            fontFamily: "var(--mono)",
            fontSize: 12,
            lineHeight: 1.6,
            background: "var(--panel)",
          }}
        >
          {logs.length === 0 ? (
            <div className="muted">시작 중…</div>
          ) : (
            logs.map((l, i) => <LogLine key={i} entry={l} baseTime={startedAt ?? 0} />)
          )}
          {errorMessage && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 6,
              background: "#fce9e9", color: "var(--err)",
              border: "1px solid var(--err)",
              whiteSpace: "pre-wrap",
            }}>
              ❌ {errorMessage}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LogLine({ entry, baseTime }: { entry: LogEntry; baseTime: number }) {
  const offsetSec = ((entry.time - baseTime) / 1000).toFixed(2);
  const { icon, color, text } = formatEvent(entry.event);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 8 }}>
      <span className="muted" style={{ fontSize: 11 }}>+{offsetSec}s</span>
      <div style={{ color }}>
        <span style={{ marginRight: 6 }}>{icon}</span>
        {text}
      </div>
    </div>
  );
}

function formatEvent(ev: StreamEvent): { icon: string; color: string; text: React.ReactNode } {
  switch (ev.type) {
    case "start":
      return {
        icon: "▶",
        color: "var(--accent-dark)",
        text: <strong>{(ev as any).title ?? "시작"}{(ev as any).total ? ` · 총 ${(ev as any).total}단계` : ""}</strong>,
      };
    case "log":
      return { icon: "·", color: "var(--muted)", text: ev.message };
    case "stage_start":
      return {
        icon: "→",
        color: "var(--info)",
        text: <><strong>{ev.label ?? ev.id}</strong>{ev.index && ev.total ? ` (${ev.index}/${ev.total})` : ""} 시작</>,
      };
    case "stage_end":
      return {
        icon: "✓",
        color: "var(--accent-dark)",
        text: <><strong>{ev.id}</strong> 완료{ev.duration_ms != null ? ` · ${ev.duration_ms.toFixed(1)}ms` : ""}{ev.summary ? ` · ${ev.summary}` : ""}</>,
      };
    case "tool_call":
      return {
        icon: "🔧",
        color: "var(--info)",
        text: <>도구 호출: <strong>{ev.name}</strong> · <span className="muted">{JSON.stringify(ev.args)}</span></>,
      };
    case "tool_result":
      return {
        icon: "↩",
        color: "var(--accent-dark)",
        text: <>도구 결과: <strong>{ev.name}</strong> — {ev.content.slice(0, 120)}{ev.content.length > 120 ? "…" : ""}</>,
      };
    case "assistant":
      return {
        icon: "💬",
        color: "var(--accent-dark)",
        text: <em>{ev.content.slice(0, 200)}{ev.content.length > 200 ? "…" : ""}</em>,
      };
    case "error":
      return { icon: "✗", color: "var(--err)", text: <strong>{ev.message}</strong> };
    case "done":
      return { icon: "🏁", color: "var(--accent-dark)", text: <strong>완료</strong> };
    default:
      return { icon: "·", color: "var(--muted)", text: JSON.stringify(ev) };
  }
}

/** Helper: drive the overlay from a streaming call. */
export async function runStreamInto<Result>(
  stream: AsyncGenerator<StreamEvent>,
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>,
): Promise<{ ok: boolean; result: Result | null; error: string | null }> {
  let result: Result | null = null;
  let error: string | null = null;
  for await (const ev of stream) {
    setLogs((prev) => [...prev, { time: Date.now(), event: ev }]);
    if (ev.type === "done") result = (ev as any).result as Result;
    if (ev.type === "error") error = ev.message;
  }
  return { ok: !error, result, error };
}

/** Hook: small state wrapper so pages can run a stream with ~3 lines of code. */
export function useStreamOverlay() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("작업 중");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = useCallback(async <R,>(
    titleText: string,
    stream: AsyncGenerator<StreamEvent>,
    opts?: { autoCloseMs?: number },
  ): Promise<{ ok: boolean; result: R | null; error: string | null }> => {
    setTitle(titleText);
    setLogs([]);
    setErrorMessage(null);
    setBusy(true);
    setOpen(true);
    setStartedAt(Date.now());
    try {
      const res = await runStreamInto<R>(stream, setLogs);
      if (!res.ok) setErrorMessage(res.error);
      if (res.ok && (opts?.autoCloseMs ?? 700) > 0) {
        const wait = opts?.autoCloseMs ?? 700;
        setTimeout(() => setOpen(false), wait);
      }
      return res;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setErrorMessage(msg);
      setLogs((prev) => [...prev, { time: Date.now(), event: { type: "error", message: msg } }]);
      return { ok: false, result: null, error: msg };
    } finally {
      setBusy(false);
    }
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return {
    run,
    overlayProps: { open, title, logs, busy, startedAt, errorMessage, onClose: close },
  };
}
