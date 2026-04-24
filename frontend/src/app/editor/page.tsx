"use client";

import { useEffect, useMemo, useState } from "react";
import {
  codegenPipeline,
  listDocuments,
  runPipeline,
  type PipelineSpec,
  type RunResult,
} from "@/lib/api";
import { useApiKey } from "@/lib/useApiKey";

const DEFAULT_SPEC: PipelineSpec = {
  id: "demo",
  name: "Basic RAG",
  query: "What are the five stages of a RAG pipeline?",
  nodes: [
    { id: "load1", type: "loader", params: { source: "demo:rag_explained.md" } },
    { id: "chunk1", type: "chunker", params: { strategy: "recursive", chunk_size: 400, chunk_overlap: 40 } },
    { id: "embed1", type: "embedder", params: { provider: "openai", model: "text-embedding-3-small" } },
    { id: "retrieve1", type: "retriever", params: { top_k: 3, provider: "openai", model: "text-embedding-3-small" } },
    { id: "gen1", type: "generator", params: { provider: "openai", model: "gpt-4o-mini", temperature: 0.2 } },
  ],
  edges: [
    { from: "load1", to: "chunk1" },
    { from: "chunk1", to: "embed1" },
    { from: "embed1", to: "retrieve1" },
    { from: "retrieve1", to: "gen1" },
  ],
};

export default function EditorPage() {
  const [specText, setSpecText] = useState(() => JSON.stringify(DEFAULT_SPEC, null, 2));
  const [apiKey, setApiKey] = useApiKey();
  const [result, setResult] = useState<RunResult | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"run" | "code" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [docs, setDocs] = useState<{ id: string; source: string }[]>([]);

  useEffect(() => {
    listDocuments().then((r) => setDocs(r.documents)).catch(() => {});
  }, []);

  const spec = useMemo<PipelineSpec | null>(() => {
    try { return JSON.parse(specText); } catch { return null; }
  }, [specText]);

  async function onRun() {
    if (!spec) { setErr("JSON parse error"); return; }
    setBusy("run"); setErr(null); setResult(null);
    try {
      const r = await runPipeline(spec, apiKey || null);
      setResult(r);
      if (!r.ok) setErr(r.error ?? "unknown error");
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(null); }
  }

  async function onCodegen() {
    if (!spec) { setErr("JSON parse error"); return; }
    setBusy("code"); setErr(null); setCode(null);
    try {
      const r = await codegenPipeline(spec);
      setCode(r.code);
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(null); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Pipeline Spec</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            이 JSON이 실행 엔진과 코드 생성기의 단일 입력입니다.
          </p>
        </div>

        <label>
          <div className="muted" style={{ marginBottom: 4 }}>OpenAI API Key (BYOK, 선택)</div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-… (비우면 해시 임베딩 + 스텁 답변)"
            style={{ width: "100%" }}
          />
        </label>

        <div className="muted" style={{ fontSize: 12 }}>
          사용 가능한 데모 문서: {docs.length === 0 ? "(로딩 중)" : docs.map((d) => d.source).join(", ")}
        </div>

        <textarea
          rows={22}
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          style={{ width: "100%" }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRun} disabled={busy !== null}>
            {busy === "run" ? "Running…" : "Run Pipeline"}
          </button>
          <button onClick={onCodegen} disabled={busy !== null} className="btn-secondary">
            {busy === "code" ? "Generating…" : "Generate Python"}
          </button>
        </div>

        {err && (
          <pre style={{ color: "var(--err)", whiteSpace: "pre-wrap" }}>{err}</pre>
        )}
      </section>

      <section style={{ display: "grid", gap: 16, alignContent: "start" }}>
        {result && <TracePanel result={result} />}
        {code && (
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Generated Python</h3>
            <pre>{code}</pre>
          </div>
        )}
        {!result && !code && (
          <div className="panel muted">
            실행하거나 코드를 생성하면 결과가 여기에 표시됩니다.
          </div>
        )}
      </section>
    </div>
  );
}

function TracePanel({ result }: { result: RunResult }) {
  return (
    <div className="panel" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Trace</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {result.ok ? "ok" : `error: ${result.error}`}
        </span>
      </div>

      {result.trace.map((ev) => (
        <div key={ev.node_id} style={{
          border: "1px solid var(--border)", borderRadius: 6, padding: 10,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <strong>{ev.node_type}</strong>
            <span className="muted mono">{ev.node_id}</span>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {ev.duration_ms.toFixed(1)} ms
            </span>
          </div>
          <div className="mono muted" style={{ fontSize: 12, marginTop: 4 }}>
            params: {JSON.stringify(ev.params)}
          </div>
          {ev.logs.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {ev.logs.map((l, i) => (
                <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ok)" }}>
                  · {l}
                </div>
              ))}
            </div>
          )}
          <details style={{ marginTop: 6 }}>
            <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>
              inputs / outputs
            </summary>
            <pre style={{ marginTop: 6 }}>{JSON.stringify({ in: ev.inputs_summary, out: ev.outputs_summary }, null, 2)}</pre>
          </details>
        </div>
      ))}

      {result.answer != null && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Final answer</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{result.answer}</div>
        </div>
      )}
    </div>
  );
}
