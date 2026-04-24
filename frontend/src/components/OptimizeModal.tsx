"use client";

import { useEffect, useState } from "react";
import { type OptimizePatch, type PipelineSpec, type RunResult } from "@/lib/api";
import { streamNDJSON, type StreamEvent } from "@/lib/stream";
import { useApiKey } from "@/lib/useApiKey";
import { LoadingOverlay, useStreamOverlay } from "@/components/LoadingOverlay";

export function OptimizeButton({
  spec, result, onApplyPatches,
}: {
  spec: PipelineSpec;
  result: RunResult;
  onApplyPatches?: (patches: OptimizePatch[]) => void;
}) {
  const [apiKey] = useApiKey();
  const { run: runWithOverlay, overlayProps } = useStreamOverlay();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [patches, setPatches] = useState<OptimizePatch[]>([]);
  const [noChange, setNoChange] = useState(false);
  const [tokens, setTokens] = useState<{ prompt: number | null; completion: number | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function onClick() {
    setReview(null); setErr(null); setNoChange(false); setPatches([]); setApplied(false);
    if (!apiKey) {
      setErr("OpenAI API 키가 필요합니다. 상단에서 입력해 주세요.");
      setOpen(true);
      return;
    }
    setLoading(true);
    type OptimizeResult = {
      review: string;
      no_change_needed: boolean;
      patches: OptimizePatch[];
      tokens: { prompt: number | null; completion: number | null };
    };
    const stream = streamNDJSON<StreamEvent>("/api/optimize/suggest/stream", {
      spec,
      trace: result.trace,
      answer: result.answer,
      api_key: apiKey,
    });
    const res = await runWithOverlay<OptimizeResult>("GPT-4o-mini 리뷰", stream);
    setLoading(false);
    if (res.result) {
      setReview(res.result.review);
      setNoChange(res.result.no_change_needed);
      setPatches(res.result.patches);
      setTokens(res.result.tokens);
      setOpen(true);
    } else if (res.error) {
      setErr(res.error);
      setOpen(true);
    }
  }

  function handleApply() {
    if (!onApplyPatches || patches.length === 0) return;
    onApplyPatches(patches);
    setApplied(true);
  }

  const onlyAfterOkRun = result.ok && !!result.answer;
  if (!onlyAfterOkRun) return null;

  return (
    <>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          background: "var(--accent-dark)", color: "white",
          padding: "8px 14px", fontSize: 13, fontWeight: 700,
        }}
      >
        {loading ? "GPT 분석 중…" : "🧠 GPT로 최적화 제안 받기"}
      </button>
      {open && (
        <OptimizeModal
          onClose={() => setOpen(false)}
          loading={loading}
          review={review}
          noChange={noChange}
          patches={patches}
          applied={applied}
          canApply={!!onApplyPatches && patches.length > 0 && !applied}
          onApply={handleApply}
          tokens={tokens}
          error={err}
        />
      )}
      <LoadingOverlay {...overlayProps} />
    </>
  );
}

function OptimizeModal({
  onClose, loading, review, noChange, patches, applied, canApply, onApply, tokens, error,
}: {
  onClose: () => void;
  loading: boolean;
  review: string | null;
  noChange: boolean;
  patches: OptimizePatch[];
  applied: boolean;
  canApply: boolean;
  onApply: () => void;
  tokens: { prompt: number | null; completion: number | null } | null;
  error: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(30, 42, 36, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 20,
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
          maxWidth: 760, width: "100%",
          maxHeight: "88vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 12px 40px rgba(30, 42, 36, 0.25)",
        }}
      >
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--accent-soft)",
          borderRadius: "12px 12px 0 0",
        }}>
          <span style={{ fontSize: 20 }}>🧠</span>
          <strong>GPT-4o-mini 최적화 제안</strong>
          {noChange && (
            <span className="badge badge-beginner" style={{ marginLeft: 8 }}>
              ✓ 최적화 불필요
            </span>
          )}
          <span style={{ flex: 1 }} />
          {tokens && (
            <span className="muted mono" style={{ fontSize: 11 }}>
              prompt={tokens.prompt ?? "?"} · completion={tokens.completion ?? "?"}
            </span>
          )}
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ fontSize: 14, padding: "2px 10px" }}
            aria-label="닫기"
          >×</button>
        </div>

        <div style={{ padding: 18, overflow: "auto" }}>
          {loading && <LoadingSpinner />}
          {error && (
            <div className="panel" style={{ background: "#fce9e9", borderColor: "var(--err)", color: "var(--err)" }}>
              {error}
            </div>
          )}
          {review && <MarkdownLite text={review} />}

          {patches.length > 0 && (
            <div style={{
              marginTop: 16, padding: 14,
              background: "var(--accent-soft)",
              border: "1.5px solid var(--accent)",
              borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <strong>⚡ 구조화된 제안 ({patches.length}건)</strong>
                {applied && <span className="badge badge-beginner">✓ 적용됨</span>}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {patches.map((p, i) => (
                  <div key={i} style={{
                    padding: "8px 10px",
                    background: "var(--panel)",
                    borderRadius: 8, border: "1px solid var(--border)",
                    fontSize: 12.5,
                  }}>
                    <div className="mono" style={{ marginBottom: 4 }}>
                      <strong style={{ color: "var(--accent-dark)" }}>{p.node_id}</strong>
                      <span className="muted" style={{ margin: "0 4px" }}>·</span>
                      <span>{p.param}</span>
                      <span className="muted" style={{ margin: "0 6px" }}>:</span>
                      <span className="muted" style={{ textDecoration: "line-through" }}>{formatVal(p.from)}</span>
                      <span style={{ margin: "0 6px" }}>→</span>
                      <strong>{formatVal(p.to)}</strong>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{p.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          {canApply && (
            <button onClick={onApply}>
              ⚡ 이 제안을 노드에 자동 적용
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "(없음)";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function LoadingSpinner() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      padding: "30px 10px",
    }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 18,
          border: "3px solid var(--accent-soft)",
          borderTopColor: "var(--accent-dark)",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <div className="muted" style={{ fontSize: 13 }}>
        GPT-4o-mini가 현재 결과와 파이프라인 파라미터를 분석 중입니다…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MarkdownLite({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7 }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

function splitBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let ulBuf: string[] = [];
  const flushPara = () => { if (buf.length) { blocks.push({ kind: "p", text: buf.join(" ") }); buf = []; } };
  const flushUl = () => { if (ulBuf.length) { blocks.push({ kind: "ul", items: ulBuf }); ulBuf = []; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flushPara(); flushUl(); continue; }
    if (line.startsWith("## ")) { flushPara(); flushUl(); blocks.push({ kind: "h2", text: line.slice(3) }); continue; }
    if (line.startsWith("### ")) { flushPara(); flushUl(); blocks.push({ kind: "h3", text: line.slice(4) }); continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushPara(); ulBuf.push(line.replace(/^\s*[-*]\s+/, "")); continue; }
    flushUl(); buf.push(line);
  }
  flushPara(); flushUl();
  return blocks;
}

function renderInline(s: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rest = s;
  let key = 0;
  while (rest.length > 0) {
    const codeM = rest.match(/`([^`]+)`/);
    const boldM = rest.match(/\*\*([^*]+)\*\*/);
    const m =
      codeM && boldM ? (codeM.index! < boldM.index! ? { tag: "code", mm: codeM } : { tag: "b", mm: boldM }) :
      codeM ? { tag: "code", mm: codeM } :
      boldM ? { tag: "b", mm: boldM } :
      null;
    if (!m) { parts.push(rest); break; }
    const idx = m.mm.index!;
    if (idx > 0) parts.push(rest.slice(0, idx));
    if (m.tag === "code") parts.push(<code key={key++}>{m.mm[1]}</code>);
    else parts.push(<strong key={key++}>{m.mm[1]}</strong>);
    rest = rest.slice(idx + m.mm[0].length);
  }
  return parts;
}

function renderBlock(b: Block, i: number): React.ReactNode {
  if (b.kind === "h2") return <h3 key={i} style={{ color: "var(--accent-dark)", marginTop: i === 0 ? 0 : 14, marginBottom: 6 }}>{b.text}</h3>;
  if (b.kind === "h3") return <h4 key={i} style={{ marginTop: 12, marginBottom: 4 }}>{b.text}</h4>;
  if (b.kind === "ul") return (
    <ul key={i} style={{ marginTop: 4, marginBottom: 8, paddingLeft: 22 }}>
      {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(it)}</li>)}
    </ul>
  );
  return <p key={i} style={{ margin: "0 0 8px" }}>{renderInline(b.text)}</p>;
}
