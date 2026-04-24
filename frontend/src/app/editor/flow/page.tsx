"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  codegenPipeline,
  getNodeTypes,
  listNewsSamples,
  type NewsSample,
  type NodeTypeSchema,
  type OptimizePatch,
  type ParamSchema,
  type PipelineSpec,
  type RunResult,
  type TraceEvent,
} from "@/lib/api";
import { streamNDJSON, type StreamEvent } from "@/lib/stream";
import { useApiKey } from "@/lib/useApiKey";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { TracePanel } from "@/components/TracePanel";
import { PipelineNode, type PipelineNodeData } from "@/components/PipelineNode";
import { TourGuide, type TourStep } from "@/components/TourGuide";
import { OptimizeButton } from "@/components/OptimizeModal";
import { LoadingOverlay, useStreamOverlay } from "@/components/LoadingOverlay";
import { CodeEditorAndRun } from "@/components/CodeEditorAndRun";

// Fallback default queries for sources not covered by news samples.
const FALLBACK_DEFAULT_QUERIES: Record<string, string> = {
  "demo:rag_explained.md": "What are the five stages of a RAG pipeline, and why does chunk size matter?",
  "demo:ai_intro.md": "What are the limits of large language models described in the text?",
};

function defaultQueryFor(source: string, samples: NewsSample[]): string | null {
  if (source.startsWith("text:")) return null;
  const match = samples.find((s) => s.source === source);
  if (match?.default_query) return match.default_query;
  return FALLBACK_DEFAULT_QUERIES[source] ?? null;
}

type NodeType = "loader" | "chunker" | "embedder" | "retriever" | "generator";

const SEED_NODES: { id: string; type: NodeType; params: Record<string, unknown> }[] = [
  { id: "load1", type: "loader", params: { source: "demo:news_ai_ethics_kr.md" } },
  { id: "chunk1", type: "chunker", params: { strategy: "recursive", chunk_size: 400, chunk_overlap: 40 } },
  { id: "embed1", type: "embedder", params: { provider: "openai", model: "text-embedding-3-small" } },
  { id: "retrieve1", type: "retriever", params: { top_k: 3, provider: "openai", model: "text-embedding-3-small" } },
  { id: "gen1", type: "generator", params: { provider: "openai", model: "gpt-4o-mini", temperature: 0.2 } },
];
const SEED_EDGES: [string, string][] = [
  ["load1", "chunk1"], ["chunk1", "embed1"], ["embed1", "retrieve1"], ["retrieve1", "gen1"],
];

const NODE_TYPES_MAP = { pipeline: PipelineNode };

const TOUR_STEPS: TourStep[] = [
  {
    selector: "[data-tour='source-picker']",
    title: "1. 문서 소스 고르기",
    body: "이 파이프라인이 읽을 문서를 선택하세요. 번들 뉴스 중 하나를 고르거나, .txt/.md 파일을 직접 업로드하거나, 원하는 텍스트를 붙여 넣을 수 있어요.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='query-input']",
    title: "2. 질문 입력",
    body: "문서에서 답할 수 있는 질문을 한국어로 적어 보세요. 예: \"가이드라인의 다섯 가지 원칙은 무엇인가?\"",
    placement: "bottom",
  },
  {
    selector: "[data-tour='api-key']",
    title: "3. OpenAI 키 (선택)",
    body: "키가 없어도 해시 임베딩 + stub 답변으로 파이프라인 흐름은 확인할 수 있습니다. 실제 GPT 답변을 보려면 키를 입력하세요. 브라우저에만 저장됩니다.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='flow-canvas']",
    title: "4. 파이프라인 그래프",
    body: "5개 노드(load → chunk → embed → retrieve → generate)가 연결돼 있습니다. 노드를 드래그해 옮기고, 노드 안에서 파라미터를 직접 바꿀 수 있어요. 연결선도 손잡이를 끌어 새로 만들 수 있습니다.",
    placement: "top",
  },
  {
    selector: "[data-tour='run-btn']",
    title: "5. 실행하기",
    body: "이 버튼을 누르면 파이프라인이 순서대로 돌아가고, 각 노드 안에 실행 결과(청크 수·검색 개수·답변 미리보기·소요 시간)가 표시됩니다. 아래 Trace 패널에서 상세 로그도 확인할 수 있어요.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='codegen-btn']",
    title: "6. 코드로 내보내기",
    body: "지금 이 그래프를 독립 실행 가능한 Python 파일로 내려받을 수 있습니다. 같은 스펙은 항상 같은 코드를 만들어 냅니다.",
    placement: "bottom",
  },
];

export default function FlowEditorPage() {
  const [apiKey] = useApiKey();
  const { run: runWithOverlay, overlayProps } = useStreamOverlay();
  const [schemas, setSchemas] = useState<Record<string, NodeTypeSchema>>({});
  const [samples, setSamples] = useState<NewsSample[]>([]);
  const [query, setQuery] = useState("가이드라인에 참여한 기업들과 다섯 가지 원칙은 무엇인가?");

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"run" | "code" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getNodeTypes().then(setSchemas).catch((e) => setErr(e.message));
    listNewsSamples().then((r) => setSamples(r.samples)).catch(() => {});
  }, []);

  useEffect(() => {
    if (Object.keys(schemas).length === 0 || nodes.length > 0) return;
    const seeded: Node[] = SEED_NODES.map((n, i) => ({
      id: n.id,
      type: "pipeline",
      position: { x: i * 280, y: 120 },
      data: {
        nodeType: n.type,
        nodeId: n.id,
        params: { ...n.params },
        schema: schemas[n.type],
        onParamsChange: makePatcher(setNodes, n.id),
        traceStatus: "idle",
      } satisfies PipelineNodeData,
    }));
    const seededEdges: Edge[] = SEED_EDGES.map(([s, t]) => ({
      id: `${s}->${t}`, source: s, target: t,
    }));
    setNodes(seeded);
    setEdges(seededEdges);
  }, [schemas]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);
  const onConnect: OnConnect = useCallback((params) => {
    setEdges((es) => addEdge({ ...params, id: `${params.source}->${params.target}` }, es));
  }, []);

  const setLoaderSource = useCallback((source: string) => {
    setNodes((ns) => ns.map((n) => {
      const d = n.data as unknown as PipelineNodeData;
      if (d.nodeType !== "loader") return n;
      return { ...n, data: { ...d, params: { ...d.params, source } } };
    }));
    // Always sync the query to this source's default so the input matches the picked doc.
    const def = defaultQueryFor(source, samples);
    if (def) setQuery(def);
  }, [samples]);

  const spec = useMemo<PipelineSpec>(() => ({
    id: "flow",
    name: "Flow Pipeline",
    query,
    nodes: nodes.map((n) => {
      const d = n.data as unknown as PipelineNodeData;
      return { id: n.id, type: d.nodeType as NodeType, params: d.params };
    }),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
  }), [nodes, edges, query]);

  // After a run, distribute trace events to their corresponding nodes.
  function applyTraceToNodes(res: RunResult) {
    const byId = new Map<string, TraceEvent>();
    res.trace.forEach((ev) => byId.set(ev.node_id, ev));
    setNodes((ns) => ns.map((n) => {
      const d = n.data as unknown as PipelineNodeData;
      const ev = byId.get(n.id);
      return {
        ...n,
        data: {
          ...d,
          traceEvent: ev,
          traceStatus: ev ? (res.ok ? "ok" : (n.id === res.trace[res.trace.length - 1]?.node_id ? "error" : "ok")) : "idle",
        },
      };
    }));
  }

  async function onRun() {
    setBusy("run"); setErr(null); setResult(null);
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...(n.data as any), traceStatus: "running", traceEvent: undefined } })));
    const stream = streamNDJSON<StreamEvent>("/api/pipelines/run/stream", { spec, api_key: apiKey || null });
    const res = await runWithOverlay<RunResult>("파이프라인 실행", stream);
    if (res.result) {
      setResult(res.result);
      applyTraceToNodes(res.result);
      if (!res.result.ok) setErr(res.result.error ?? "unknown error");
    } else if (res.error) {
      setErr(res.error);
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...(n.data as any), traceStatus: "idle" } })));
    }
    setBusy(null);
  }
  const applyPatches = useCallback((patches: OptimizePatch[]) => {
    setNodes((ns) => ns.map((n) => {
      const applicable = patches.filter((p) => p.node_id === n.id);
      if (applicable.length === 0) return n;
      const d = n.data as unknown as PipelineNodeData;
      const newParams = { ...d.params };
      for (const p of applicable) {
        const paramSpec = d.schema?.params?.[p.param] as ParamSchema | undefined;
        newParams[p.param] = coerceValue(p.to, paramSpec);
      }
      return { ...n, data: { ...d, params: newParams } };
    }));
  }, []);

  async function onCodegen() {
    setBusy("code"); setErr(null); setCode(null);
    try {
      const r = await codegenPipeline(spec);
      setCode(r.code);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const currentSource = useMemo(() => {
    const loader = nodes.find((n) => (n.data as any).nodeType === "loader");
    return (loader?.data as any)?.params?.source as string | undefined;
  }, [nodes]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="panel" style={{ display: "grid", gap: 14 }}>
        <SourcePicker
          samples={samples}
          currentSource={currentSource ?? ""}
          onPick={setLoaderSource}
        />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr", gap: 12 }}>
          <label data-tour="query-input" style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>질문</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="문서에서 답할 수 있는 질문을 한국어로"
            />
          </label>
          <div data-tour="api-key">
            <ApiKeyInput />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button data-tour="run-btn" onClick={onRun} disabled={busy !== null}>
            {busy === "run" ? "Running…" : "▶ Run Pipeline"}
          </button>
          <button data-tour="codegen-btn" onClick={onCodegen} disabled={busy !== null} className="btn-secondary">
            {busy === "code" ? "Generating…" : "Generate Python"}
          </button>
          {result?.ok && <span className="muted" style={{ fontSize: 12 }}>
            ✓ 실행 완료 · 노드 안에 결과 표시됨
          </span>}
          <span style={{ flex: 1 }} />
          {result?.ok && result.answer && (
            <OptimizeButton spec={spec} result={result} onApplyPatches={applyPatches} />
          )}
        </div>
        {err && <pre style={{ color: "var(--err)", whiteSpace: "pre-wrap" }}>{err}</pre>}
      </section>

      <section data-tour="flow-canvas" className="panel" style={{ padding: 0, height: 500, overflow: "hidden" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES_MAP}
          fitView
          colorMode="light"
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {result
            ? <TracePanel result={result} />
            : <div className="panel muted">Run Pipeline을 눌러 트레이스를 확인하세요.</div>}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {code && (
            <CodeEditorAndRun
              title="Generated Python"
              subtitle="deterministic from spec · 편집 후 ▶ Run 으로 바로 실행"
              initialCode={code}
            />
          )}
          <details className="panel">
            <summary style={{ cursor: "pointer" }} className="muted">
              Spec (그래프에서 파생된 JSON)
            </summary>
            <pre style={{ marginTop: 10 }}>{JSON.stringify(spec, null, 2)}</pre>
          </details>
        </div>
      </section>

      <TourGuide steps={TOUR_STEPS} storageKey="skku-rag:tour-flow-editor" />
      <LoadingOverlay {...overlayProps} />
    </div>
  );
}

function coerceValue(raw: unknown, spec: ParamSchema | undefined): unknown {
  if (spec?.type === "int") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.round(n) : raw;
  }
  if (spec?.type === "float") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (spec?.type === "enum" && Array.isArray(spec.options)) {
    const s = String(raw);
    return spec.options.includes(s) ? s : raw;
  }
  return typeof raw === "string" ? raw : String(raw);
}

function makePatcher(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  nodeId: string,
) {
  return (patch: Record<string, unknown>) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as unknown as PipelineNodeData;
        return { ...n, data: { ...d, params: { ...d.params, ...patch } } };
      }),
    );
  };
}

/* ---------------- Source picker ---------------- */

type SourceMode = "demo" | "upload" | "paste";

function SourcePicker({
  samples, currentSource, onPick,
}: {
  samples: NewsSample[];
  currentSource: string;
  onPick: (source: string) => void;
}) {
  // Infer initial mode from currentSource.
  const initialMode: SourceMode =
    currentSource.startsWith("text:") ? "paste" :
    currentSource.startsWith("demo:") ? "demo" : "demo";
  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [pasteText, setPasteText] = useState("");
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      onPick(`text:${content}`);
      setUploadedName(f.name);
    };
    reader.onerror = () => setUploadedName(`읽기 실패: ${f.name}`);
    reader.readAsText(f, "utf-8");
  }

  function onApplyPaste() {
    if (!pasteText.trim()) return;
    onPick(`text:${pasteText}`);
  }

  const bundledExtras = [
    { source: "demo:rag_explained.md", title: "RAG 개념 설명 (영문)", category: "기술 문서" },
    { source: "demo:ai_intro.md", title: "AI 소개 (영문)", category: "기술 문서" },
  ];

  return (
    <div data-tour="source-picker">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong>문서 소스</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          파이프라인의 첫 Loader 노드가 이 문서를 읽습니다
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["demo", "upload", "paste"] as SourceMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={mode === m ? undefined : "btn-secondary"}
            style={{ fontSize: 12, padding: "6px 12px" }}
          >
            {m === "demo" ? "번들 뉴스" : m === "upload" ? "파일 업로드" : "직접 입력"}
          </button>
        ))}
      </div>

      {mode === "demo" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
          {samples.map((s) => (
            <SourceCard
              key={s.id}
              active={currentSource === s.source}
              onClick={() => onPick(s.source)}
              category={s.category}
              title={s.title}
              sub={`${s.chars}자 · ${s.tags.slice(0, 3).join(", ")}`}
            />
          ))}
          {bundledExtras.map((e) => (
            <SourceCard
              key={e.source}
              active={currentSource === e.source}
              onClick={() => onPick(e.source)}
              category={e.category}
              title={e.title}
            />
          ))}
        </div>
      )}

      {mode === "upload" && (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={onFile}
              style={{ display: "none" }}
            />
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              📄 파일 선택 (.txt 또는 .md)
            </button>
            {uploadedName && (
              <span style={{ marginLeft: 10, fontSize: 12 }}>
                업로드됨: <code>{uploadedName}</code>
              </span>
            )}
          </div>
          {currentSource.startsWith("text:") && (
            <div className="muted" style={{ fontSize: 12 }}>
              현재 로더는 인라인 텍스트 {(currentSource.length - 5).toLocaleString()}자를 사용합니다.
            </div>
          )}
        </div>
      )}

      {mode === "paste" && (
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            rows={7}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="여기에 문서 본문을 붙여 넣으세요. 뉴스 기사, 내부 자료, 논문 요약 등 무엇이든 가능."
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onApplyPaste} disabled={!pasteText.trim()}>
              이 텍스트로 실습
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {pasteText.length.toLocaleString()}자
            </span>
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        현재 선택: <code>{currentSource.startsWith("text:") ? `inline (${(currentSource.length - 5).toLocaleString()}자)` : currentSource}</code>
      </div>
    </div>
  );
}

function SourceCard({
  active, onClick, category, title, sub,
}: { active: boolean; onClick: () => void; category: string; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 10,
        background: active ? "var(--accent-soft)" : "var(--panel)",
        color: "var(--text)",
        border: `1.5px solid ${active ? "var(--accent-dark)" : "var(--border)"}`,
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{category}</div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: sub ? 4 : 0 }}>{title}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </button>
  );
}
