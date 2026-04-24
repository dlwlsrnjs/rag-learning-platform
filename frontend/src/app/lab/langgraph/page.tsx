"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  getAgentNodeTypes,
  listNewsSamples,
  type AgentTraceEvent,
  type NewsSample,
  type NodeTypeSchema,
} from "@/lib/api";
import { streamNDJSON, type StreamEvent } from "@/lib/stream";
import { useApiKey } from "@/lib/useApiKey";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { PipelineNode, type PipelineNodeData } from "@/components/PipelineNode";
import { LoadingOverlay, useStreamOverlay } from "@/components/LoadingOverlay";
import { CodeEditorAndRun } from "@/components/CodeEditorAndRun";

const NODE_TYPES_MAP = { pipeline: PipelineNode };

type ToolKind =
  | "tool_calculator"
  | "tool_current_time"
  | "tool_regex_extract"
  | "tool_unit_convert"
  | "tool_word_count"
  | "tool_rag_retrieve"
  | "tool_read_demo_doc"
  | "tool_translate_text"
  | "tool_summarize_doc";

type ToolCatalogEntry = { type: ToolKind; label: string; hint: string; group: "basic" | "doc" | "llm" };

const TOOL_CATALOG: ToolCatalogEntry[] = [
  { type: "tool_calculator", label: "계산기", hint: "산술식을 정확히 계산", group: "basic" },
  { type: "tool_current_time", label: "현재 시간", hint: "시간대·포맷 지정", group: "basic" },
  { type: "tool_regex_extract", label: "정규식 추출", hint: "이메일·전화·URL 등 패턴 추출", group: "basic" },
  { type: "tool_unit_convert", label: "단위 변환", hint: "길이·질량·온도", group: "basic" },
  { type: "tool_word_count", label: "글자수 집계", hint: "글자·단어·줄 수", group: "basic" },
  { type: "tool_rag_retrieve", label: "RAG 검색", hint: "문서에서 관련 청크 조회", group: "doc" },
  { type: "tool_read_demo_doc", label: "문서 읽기", hint: "파일명을 받아 본문 반환", group: "doc" },
  { type: "tool_translate_text", label: "번역", hint: "지정 언어로 번역 (OpenAI)", group: "llm" },
  { type: "tool_summarize_doc", label: "문서 요약", hint: "스타일 지정 요약 (OpenAI)", group: "llm" },
];

const GROUP_LABEL: Record<ToolCatalogEntry["group"], string> = {
  basic: "기본 · 결정론적",
  doc: "문서",
  llm: "LLM 활용",
};

/* ---------- Example presets ---------- */

type ExamplePreset = {
  id: string;
  label: string;
  description: string;
  query: string;
  tools: { type: ToolKind; params?: Record<string, unknown> }[];
};

const EXAMPLES: ExamplePreset[] = [
  {
    id: "rag-and-calc",
    label: "RAG 검색 + 계산",
    description: "문서에서 수치를 찾아 계산기로 환산. 두 툴이 협업하는 전형.",
    query:
      "news_kpop_kr.md에서 남미 투어 티켓 판매액을 찾은 뒤, 그 금액을 1300원/달러 환율로 달러 금액까지 계산해 줘.",
    tools: [
      { type: "tool_rag_retrieve", params: { source: "demo:news_kpop_kr.md", top_k: 3 } },
      { type: "tool_calculator" },
    ],
  },
  {
    id: "summarize-and-translate",
    label: "요약 + 번역",
    description: "한국어 뉴스를 bullets로 요약하고 영어로 번역해서 결과를 묶어 주는 사례.",
    query: "news_economy_kr.md를 불릿 3~4개로 요약한 다음, 그 요약을 영어로 번역해서 둘 다 보여 줘.",
    tools: [
      { type: "tool_summarize_doc", params: { source: "demo:news_economy_kr.md", style: "bullets" } },
      { type: "tool_translate_text", params: { target_lang: "en" } },
    ],
  },
  {
    id: "time-and-calc",
    label: "현재 시간 + 날짜 계산",
    description: "에이전트가 현재 시간을 먼저 받고, 상대 시간을 계산기로 환산.",
    query: "지금 시각 기준으로 한국 시간으로 6시간 30분 전은 몇 시야? 현재 시간도 같이 알려 줘.",
    tools: [
      { type: "tool_current_time", params: { timezone: "Asia/Seoul", format: "%Y-%m-%d %H:%M:%S" } },
      { type: "tool_calculator" },
    ],
  },
  {
    id: "regex-extract",
    label: "텍스트 정보 추출",
    description: "주어진 문단에서 이메일이나 날짜 등 구조화 정보만 뽑아 내는 사례.",
    query:
      "다음 문단에서 이메일을 모두 추출해 줘: '문의는 support@skku.ac.kr 이나 admissions@skku.edu 로 보내고, 긴급은 cs@example.com 도 가능합니다. 070-1234-5678.'",
    tools: [{ type: "tool_regex_extract", params: { pattern_preset: "email" } }],
  },
  {
    id: "unit-convert",
    label: "단위 변환",
    description: "LLM이 직접 변환하면 틀리기 쉬운 단위 계산을 툴에 위임.",
    query: "100킬로그램은 몇 파운드야? 그리고 10미터는 몇 피트인지도 같이 알려 줘.",
    tools: [
      { type: "tool_unit_convert", params: { category: "mass" } },
      { type: "tool_unit_convert", params: { category: "length" } },
    ],
  },
  {
    id: "full-stack",
    label: "종합: 문서 → 요약 → 번역 → 글자수",
    description: "한 질문으로 4개 툴이 순차적으로 호출되는 체이닝 예시. 툴 여러 개 연계를 이해하기 좋음.",
    query: "news_space_kr.md를 한 문장으로 요약하고, 그 요약을 영어로 번역한 뒤, 영어 번역본의 글자 수와 단어 수를 알려 줘.",
    tools: [
      { type: "tool_summarize_doc", params: { source: "demo:news_space_kr.md", style: "one_line" } },
      { type: "tool_translate_text", params: { target_lang: "en" } },
      { type: "tool_word_count" },
    ],
  },
];

/* ---------- Page ---------- */

export default function LangGraphLabPage() {
  const [apiKey] = useApiKey();
  const { run: runWithOverlay, overlayProps } = useStreamOverlay();
  const [schemas, setSchemas] = useState<Record<string, NodeTypeSchema>>({});
  const [samples, setSamples] = useState<NewsSample[]>([]);
  const [query, setQuery] = useState(EXAMPLES[0].query);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    answer: string | null;
    trace: AgentTraceEvent[];
    model: string;
  } | null>(null);

  useEffect(() => {
    getAgentNodeTypes().then(setSchemas).catch((e) => setErr(e.message));
    listNewsSamples().then((r) => setSamples(r.samples)).catch(() => {});
  }, []);

  const makePatcher = useCallback((nodeId: string) => {
    return (patch: Record<string, unknown>) => {
      setNodes((ns) => ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as unknown as PipelineNodeData;
        return { ...n, data: { ...d, params: { ...d.params, ...patch } } };
      }));
    };
  }, []);

  const makeRemover = useCallback((nodeId: string) => {
    return () => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setActiveExampleId(null); // modifying canvas breaks the "active example" state
    };
  }, []);

  /* ---- seed: agent node only (no tools by default; examples drive tool addition) ---- */
  useEffect(() => {
    if (Object.keys(schemas).length === 0 || nodes.length > 0) return;
    // Load the first example by default to show something useful.
    applyExample(EXAMPLES[0], schemas);
  }, [schemas]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onConnect: OnConnect = useCallback((params) => {
    setEdges((es) => addEdge({ ...params, id: `${params.source}->${params.target}` }, es));
  }, []);

  /* ---- Build a fresh canvas for a given tool set ---- */
  function applyExample(ex: ExamplePreset, schemasArg?: Record<string, NodeTypeSchema>) {
    const sch = schemasArg ?? schemas;
    if (Object.keys(sch).length === 0) return;

    const agentId = "agent1";
    const newNodes: Node[] = [{
      id: agentId, type: "pipeline",
      position: { x: 400, y: 40 },
      data: {
        nodeType: "agent",
        nodeId: agentId,
        params: defaultsFor(sch.agent),
        schema: sch.agent,
        onParamsChange: makePatcher(agentId),
      } satisfies PipelineNodeData,
    }];

    const newEdges: Edge[] = [];
    const usedCounts: Record<string, number> = {};
    ex.tools.forEach((t, i) => {
      usedCounts[t.type] = (usedCounts[t.type] ?? 0) + 1;
      const nodeId = `${t.type.replace("tool_", "t_")}_${usedCounts[t.type]}`;
      newNodes.push({
        id: nodeId, type: "pipeline",
        position: { x: 120 + i * 280, y: 280 },
        data: {
          nodeType: t.type,
          nodeId,
          params: { ...defaultsFor(sch[t.type]), ...(t.params ?? {}) },
          schema: sch[t.type],
          onParamsChange: makePatcher(nodeId),
          onRemove: makeRemover(nodeId),
        } satisfies PipelineNodeData,
      });
      newEdges.push({
        id: `${agentId}->${nodeId}`, source: agentId, target: nodeId,
        animated: true, style: { stroke: "var(--accent)", strokeWidth: 2 },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setQuery(ex.query);
    setActiveExampleId(ex.id);
    setResult(null);
  }

  /* ---- Add one tool from palette (keeps existing graph) ---- */
  function addTool(toolType: ToolKind) {
    const existingCount = nodes.filter((n) => (n.data as any).nodeType === toolType).length;
    const newId = `${toolType.replace("tool_", "t_")}_${existingCount + 1}`;
    const agentNode = nodes.find((n) => (n.data as any).nodeType === "agent");
    const agentId = agentNode?.id ?? "agent1";
    const tools = nodes.filter((n) => (n.data as any).nodeType !== "agent");
    const x = 80 + tools.length * 260;
    const y = 280;
    const newNode: Node = {
      id: newId, type: "pipeline",
      position: { x, y },
      data: {
        nodeType: toolType,
        nodeId: newId,
        params: defaultsFor(schemas[toolType]),
        schema: schemas[toolType],
        onParamsChange: makePatcher(newId),
        onRemove: makeRemover(newId),
      } satisfies PipelineNodeData,
    };
    setNodes((ns) => [...ns, newNode]);
    setEdges((es) => [...es, {
      id: `${agentId}->${newId}`, source: agentId, target: newId,
      animated: true, style: { stroke: "var(--accent)", strokeWidth: 2 },
    }]);
    setActiveExampleId(null);
  }

  /* ---- Run ---- */
  const currentNodes = useMemo(() => nodes.map((n) => {
    const d = n.data as unknown as PipelineNodeData;
    return { id: n.id, type: d.nodeType, params: d.params };
  }), [nodes]);

  async function onRun() {
    if (!apiKey) { setErr("OpenAI API 키가 필요합니다."); return; }
    setBusy(true); setErr(null); setResult(null);
    setNodes((ns) => ns.map((n) => ({
      ...n,
      data: {
        ...(n.data as any),
        statusHint: undefined,
        traceStatus: (n.data as any).nodeType === "agent" ? "running" : "idle",
      },
    })));

    type AgentResult = { answer: string | null; trace: AgentTraceEvent[]; model: string; tool_nodes_used: string[] };
    const stream = streamNDJSON<StreamEvent>("/api/agent/run/stream", { query, nodes: currentNodes, api_key: apiKey });
    const res = await runWithOverlay<AgentResult>("LangGraph 에이전트 실행", stream);

    if (res.result) {
      const r = res.result;
      setResult({ answer: r.answer, trace: r.trace, model: r.model });
      const callCounts: Record<string, number> = {};
      for (const ev of r.trace) {
        if (ev.type === "tool_call") callCounts[ev.name] = (callCounts[ev.name] ?? 0) + 1;
      }
      setNodes((ns) => ns.map((n) => {
        const d = n.data as any;
        if (d.nodeType === "agent") {
          const total = Object.values(callCounts).reduce((a, b) => a + b, 0);
          return { ...n, data: { ...d, traceStatus: "ok", statusHint: `도구 호출 ${total}회` } };
        }
        const toolName = d.nodeType?.replace("tool_", "") ?? "";
        const count = callCounts[toolName];
        if (count) return { ...n, data: { ...d, traceStatus: "ok", statusHint: `이번 실행에서 ${count}회 호출됨` } };
        return { ...n, data: { ...d, traceStatus: "idle", statusHint: "호출되지 않음" } };
      }));
    } else if (res.error) {
      setErr(res.error);
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...(n.data as any), traceStatus: "idle" } })));
    }
    setBusy(false);
  }

  /* ---- Render ---- */

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h1 style={{ margin: 0 }}>LangGraph 실험실</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 820 }}>
          아래 그래프는 실제로 <strong>LangGraph의 <code>create_react_agent</code></strong>로 빌드돼 돌아갑니다.
          중앙 <em>agent</em> 노드가 LLM이고, 주변 <em>tool</em> 노드들이 그 에이전트에 바인딩됩니다.
          예시 사례 중 하나를 눌러 시작하거나, 팔레트에서 툴을 직접 조립해 보세요.
          각 툴 안의 <strong>?</strong> 를 누르면 파라미터 의미를 볼 수 있습니다.
        </p>
      </section>

      {/* Example presets */}
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong>예시 사례</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            · 클릭하면 캔버스가 초기화되고 이 예시에 필요한 툴만 다시 세팅됩니다
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 8,
        }}>
          {EXAMPLES.map((ex) => {
            const active = ex.id === activeExampleId;
            return (
              <button
                key={ex.id}
                onClick={() => applyExample(ex)}
                className={active ? undefined : "btn-secondary"}
                style={{ textAlign: "left", padding: "10px 12px" }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  {active && <span>✓</span>}
                  <strong style={{ fontSize: 13 }}>{ex.label}</strong>
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontSize: 10, opacity: 0.7,
                    color: active ? "inherit" : "var(--muted)",
                  }}>
                    툴 {ex.tools.length}개
                  </span>
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.9 }}>{ex.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Query + api key + run */}
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>질문</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <ApiKeyInput />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onRun} disabled={busy}>
            {busy ? "에이전트 실행 중…" : "▶ Agent 실행"}
          </button>
          {result?.answer != null && !busy && (
            <span className="muted" style={{ fontSize: 12 }}>
              ✓ {result.trace.filter(t => t.type === "tool_call").length}회 도구 호출 · 모델 {result.model}
            </span>
          )}
        </div>
        {err && <pre style={{ color: "var(--err)", whiteSpace: "pre-wrap" }}>{err}</pre>}
      </section>

      {/* Palette + canvas */}
      <section style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}>
        <aside className="panel" style={{
          display: "grid", gap: 10, alignContent: "start",
          maxHeight: 520, overflowY: "auto",
        }}>
          <strong style={{ fontSize: 14 }}>툴 팔레트</strong>
          <p className="muted" style={{ fontSize: 11, margin: 0 }}>
            클릭하면 캔버스에 추가되고 agent와 자동 연결됩니다. 같은 툴을 여러 번 추가할 수도 있어요(설정이 다르면).
          </p>
          {(["basic", "doc", "llm"] as const).map((g) => (
            <div key={g} style={{ display: "grid", gap: 6 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}>
                {GROUP_LABEL[g]}
              </div>
              {TOOL_CATALOG.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.type}
                  className="btn-secondary"
                  onClick={() => addTool(t.type)}
                  style={{ textAlign: "left", padding: "8px 10px" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12 }}>+ {t.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{t.hint}</div>
                </button>
              ))}
            </div>
          ))}
          {samples.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                RAG/요약 툴에 쓸 문서
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11 }}>
                {samples.slice(0, 5).map((s) => (
                  <li key={s.id} className="mono" style={{ marginBottom: 2 }}>
                    {s.source}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="panel" style={{ padding: 0, height: 520, overflow: "hidden" }}>
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
        </div>
      </section>

      {result && <TraceTimeline result={result} query={query} />}

      {nodes.length > 0 && (
        <CodeEditorAndRun
          title="Generated Python (LangGraph)"
          subtitle="현재 캔버스에서 추출 · 편집 가능, ▶ Run 으로 직접 실행"
          initialCode={generateLangGraphPython(currentNodes, query)}
        />
      )}

      <LoadingOverlay {...overlayProps} />
    </div>
  );
}

/* ---------- helpers ---------- */

function defaultsFor(schema: NodeTypeSchema | undefined): Record<string, unknown> {
  if (!schema?.params) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema.params)) {
    if ((v as any).default !== undefined) out[k] = (v as any).default;
  }
  return out;
}

function TraceTimeline({
  result, query,
}: { result: { answer: string | null; trace: AgentTraceEvent[]; model: string }; query: string }) {
  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>실행 트레이스</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        질문: <em>{query}</em>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {result.trace.map((ev, i) => <TraceItem key={i} ev={ev} index={i + 1} />)}
        {result.trace.length === 0 && (
          <div className="muted">도구 호출 없이 바로 답변했습니다.</div>
        )}
      </div>
      {result.answer && (
        <div style={{
          marginTop: 14, padding: 12,
          background: "var(--accent-soft)", border: "1.5px solid var(--accent)",
          borderRadius: 10,
        }}>
          <strong style={{ color: "var(--accent-dark)" }}>최종 답변</strong>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{result.answer}</div>
        </div>
      )}
    </section>
  );
}

function TraceItem({ ev, index }: { ev: AgentTraceEvent; index: number }) {
  const stripe =
    ev.type === "tool_call" ? "var(--info)" :
    ev.type === "tool_result" ? "var(--accent)" :
    "var(--accent-dark)";
  const label =
    ev.type === "tool_call" ? `🔧 도구 호출: ${ev.name}` :
    ev.type === "tool_result" ? `↩ 도구 결과: ${ev.name}` :
    `💬 에이전트 응답`;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 6px 1fr", gap: 10, alignItems: "start",
    }}>
      <span className="mono muted" style={{ fontSize: 11, paddingTop: 2 }}>#{index}</span>
      <span style={{ background: stripe, borderRadius: 2 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{label}</div>
        {ev.type === "tool_call" && (
          <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(ev.args, null, 2)}</pre>
        )}
        {ev.type === "tool_result" && (
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{ev.content}</pre>
        )}
        {ev.type === "assistant" && (
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{ev.content}</div>
        )}
      </div>
    </div>
  );
}

function generateLangGraphPython(
  nodes: { id: string; type: string; params: Record<string, unknown> }[],
  query: string,
): string {
  const agent = nodes.find((n) => n.type === "agent");
  const tools = nodes.filter((n) => n.type !== "agent");
  const defs: string[] = [];
  const refs: string[] = [];
  const used = new Set<string>();

  for (const t of tools) {
    const key = `${t.type}__${JSON.stringify(t.params)}`;
    if (used.has(key)) continue; // skip duplicate configs in Python sample
    used.add(key);
    const ref = pyToolFunctionName(t);
    refs.push(ref);
    defs.push(pyToolDefinition(t, ref));
  }

  const model = String(agent?.params.model ?? "gpt-4o-mini");
  const temp = Number(agent?.params.temperature ?? 0.2);
  const sysPrompt = String(agent?.params.system_prompt ?? "당신은 한국어 조수입니다.");

  return `# LangGraph ReAct 에이전트 — 현재 캔버스와 동일한 구성
import os
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

${defs.join("\n\n") || "# (등록된 툴 없음)"}

llm = ChatOpenAI(
    model="${model}",
    temperature=${temp},
    api_key=os.environ["OPENAI_API_KEY"],
)

agent = create_react_agent(
    llm,
    tools=[${refs.join(", ")}],
    prompt=${JSON.stringify(sysPrompt)},
)

result = agent.invoke({"messages": [("user", ${JSON.stringify(query)})]})
for m in result["messages"]:
    print(type(m).__name__, "-", m.content[:200] if hasattr(m, "content") else m)
`;
}

function pyToolFunctionName(t: { type: string; params: Record<string, unknown> }) {
  const base = t.type.replace("tool_", "");
  // Suffix based on params for uniqueness when multiple of same type.
  if (t.type === "tool_rag_retrieve" && t.params.source) {
    return `${base}__${String(t.params.source).replace(/[^a-z0-9]/gi, "_")}`;
  }
  if (t.type === "tool_unit_convert" && t.params.category) {
    return `${base}__${String(t.params.category)}`;
  }
  if (t.type === "tool_translate_text" && t.params.target_lang) {
    return `${base}__${String(t.params.target_lang)}`;
  }
  if (t.type === "tool_regex_extract" && t.params.pattern_preset) {
    return `${base}__${String(t.params.pattern_preset)}`;
  }
  return base;
}

function pyToolDefinition(
  t: { type: string; params: Record<string, unknown> },
  refName: string,
): string {
  const p = t.params;
  switch (t.type) {
    case "tool_calculator":
      return `@tool
def ${refName}(expression: str) -> str:
    """산술식을 계산해 결과 반환."""
    import math
    safe = {"__builtins__": {}, "sqrt": math.sqrt, "pi": math.pi, "e": math.e,
            "abs": abs, "min": min, "max": max, "round": round, "pow": pow}
    return str(eval(expression, safe, {}))`;
    case "tool_current_time":
      return `@tool
def ${refName}() -> str:
    """현재 시간을 ${p.timezone ?? "Asia/Seoul"} 기준 ${p.format ?? "%Y-%m-%d %H:%M:%S"} 포맷으로 반환."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(${JSON.stringify(p.timezone ?? "Asia/Seoul")})).strftime(${JSON.stringify(p.format ?? "%Y-%m-%d %H:%M:%S")})`;
    case "tool_regex_extract":
      return `@tool
def ${refName}(text: str) -> str:
    """텍스트에서 ${p.pattern_preset ?? "email"} 패턴을 추출."""
    import re
    pattern = ${JSON.stringify(patternFor(String(p.pattern_preset ?? "email")))}
    matches = re.findall(pattern, text)
    return "\\n".join(f"- {m}" for m in matches) or "(매칭 없음)"`;
    case "tool_unit_convert":
      return `@tool
def ${refName}(value: float, from_unit: str, to_unit: str) -> str:
    """${p.category ?? "length"} 카테고리의 단위를 변환."""
    # (실전에서는 pint 같은 라이브러리를 쓰세요)
    return f"{value} {from_unit} → {to_unit}로 변환"`;
    case "tool_word_count":
      return `@tool
def ${refName}(text: str) -> str:
    """글자·단어·줄 수 반환."""
    return f"글자 {len(text)}자 · 단어 {len(text.split())}개 · 줄 {text.count(chr(10)) + 1}줄"`;
    case "tool_rag_retrieve":
      return `@tool
def ${refName}(query: str) -> str:
    """${p.source} 문서에서 query 관련 상위 ${p.top_k ?? 3}개 청크 반환."""
    from pathlib import Path
    text = Path(${JSON.stringify(String(p.source ?? "demo:").replace("demo:", "demo_docs/"))}).read_text("utf-8")
    # 청킹·임베딩·검색은 생략 (서버 쪽 구현 참고)
    return "(상위 청크들)"`;
    case "tool_read_demo_doc":
      return `@tool
def ${refName}(filename: str) -> str:
    """demo_docs 내 파일을 최대 ${p.max_chars ?? 2000}자까지 반환."""
    from pathlib import Path
    return (Path("demo_docs") / filename).read_text("utf-8")[:${p.max_chars ?? 2000}]`;
    case "tool_translate_text":
      return `@tool
def ${refName}(text: str) -> str:
    """텍스트를 ${p.target_lang ?? "en"}로 번역 (OpenAI gpt-4o-mini)."""
    from openai import OpenAI
    client = OpenAI()
    resp = client.chat.completions.create(
        model="gpt-4o-mini", temperature=0,
        messages=[
            {"role": "system", "content": f"Translate to ${p.target_lang ?? "en"}. Return only the translation."},
            {"role": "user", "content": text},
        ],
    )
    return resp.choices[0].message.content`;
    case "tool_summarize_doc":
      return `@tool
def ${refName}() -> str:
    """${p.source} 문서를 ${p.style ?? "bullets"} 스타일로 요약 (OpenAI gpt-4o-mini)."""
    from pathlib import Path
    from openai import OpenAI
    text = Path(${JSON.stringify(String(p.source ?? "demo:").replace("demo:", "demo_docs/"))}).read_text("utf-8")[:5000]
    style_prompts = {
        "bullets": "한국어로 3~5개 불릿 요약.",
        "one_line": "한국어로 한 문장 요약.",
        "formal": "한국어로 섹션 헤딩 포함한 구조적 요약.",
    }
    resp = OpenAI().chat.completions.create(
        model="gpt-4o-mini", temperature=0.2,
        messages=[
            {"role": "system", "content": style_prompts[${JSON.stringify(p.style ?? "bullets")}]},
            {"role": "user", "content": text},
        ],
    )
    return resp.choices[0].message.content`;
    default:
      return `# unsupported tool: ${t.type}`;
  }
}

function patternFor(preset: string): string {
  const map: Record<string, string> = {
    email: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    phone_kr: "01[016-9][-\\s]?\\d{3,4}[-\\s]?\\d{4}",
    url: "https?://[^\\s<>\"]+",
    date: "\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}",
    hashtag: "#[\\w가-힣]+",
    number: "-?\\d+(?:\\.\\d+)?",
  };
  return map[preset] ?? map.email;
}
