"use client";

import { useEffect, useState } from "react";
import {
  chunkPreview,
  codegenPipeline,
  listNewsSamples,
  runPipeline,
  searchNews,
  type ChunkPreview,
  type LiveArticle,
  type NewsSample,
  type PipelineSpec,
  type RunResult,
} from "@/lib/api";
import { useApiKey } from "@/lib/useApiKey";
import { TracePanel } from "@/components/TracePanel";
import { CodingExercise } from "@/components/tutorial/CodingExercise";
import type { StepRender } from "@/lib/lessons";

/** Shared state that persists across steps inside one lesson. */
export type LessonCtx = {
  selectedDoc: string | null;
  setSelectedDoc: (s: string) => void;
  lastResult: RunResult | null;
  setLastResult: (r: RunResult) => void;
  lastCode: string | null;
  setLastCode: (c: string | null) => void;
  newsApiKey: string;
  setNewsApiKey: (s: string) => void;
};

export function useLessonCtx(): LessonCtx {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [newsApiKey, setNewsApiKey] = useState("");
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("rag-site:news-key") : null;
    if (v) setNewsApiKey(v);
  }, []);
  function persistNewsKey(v: string) {
    setNewsApiKey(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem("rag-site:news-key", v);
      else window.localStorage.removeItem("rag-site:news-key");
    }
  }
  return {
    selectedDoc, setSelectedDoc,
    lastResult, setLastResult,
    lastCode, setLastCode,
    newsApiKey, setNewsApiKey: persistNewsKey,
  };
}

export function StepRenderer({ render, ctx }: { render: StepRender; ctx: LessonCtx }) {
  switch (render.kind) {
    case "explain":
      return null;
    case "doc-picker":
      return <DocPicker ctx={ctx} />;
    case "news-search":
      return <NewsSearch ctx={ctx} />;
    case "chunk-compare":
      return <ChunkCompare source={render.source ?? ctx.selectedDoc ?? "demo:rag_explained.md"} configs={render.configs} />;
    case "run-pipeline":
      return <RunPipeline spec={specWithDoc(render.spec, ctx.selectedDoc)} ctx={ctx} />;
    case "trace-view":
      return <TraceOrHint ctx={ctx} />;
    case "generate-code":
      return <GenerateCode spec={specWithDoc(render.spec, ctx.selectedDoc)} ctx={ctx} />;
    case "external-link":
      return (
        <a href={render.href}>
          <button>{render.label}</button>
        </a>
      );
    case "coding":
      return (
        <CodingExercise
          intro={render.intro}
          starterCode={render.starterCode}
          tasks={render.tasks}
          lineHints={render.lineHints}
          storageKey={render.storageKey}
        />
      );
  }
}

function specWithDoc(spec: PipelineSpec, chosen: string | null): PipelineSpec {
  if (!chosen) return spec;
  return {
    ...spec,
    nodes: spec.nodes.map((n) =>
      n.type === "loader" ? { ...n, params: { ...n.params, source: chosen } } : n
    ),
  };
}

/* ---------------- Doc picker ---------------- */

function DocPicker({ ctx }: { ctx: LessonCtx }) {
  const [samples, setSamples] = useState<NewsSample[]>([]);
  useEffect(() => {
    listNewsSamples().then((r) => setSamples(r.samples)).catch(() => {});
  }, []);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        현재 선택: {ctx.selectedDoc ? <code>{ctx.selectedDoc}</code> : "없음"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {samples.map((s) => {
          const active = ctx.selectedDoc === s.source;
          return (
            <button
              key={s.id}
              onClick={() => ctx.setSelectedDoc(s.source)}
              style={{
                textAlign: "left", padding: 12,
                background: active ? "var(--accent-soft)" : "var(--panel)",
                color: "var(--text)",
                border: `1.5px solid ${active ? "var(--accent-dark)" : "var(--border)"}`,
                borderRadius: 8, cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{s.category}</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {s.chars}자 · {s.tags.join(", ")}
              </div>
            </button>
          );
        })}
        <button
          onClick={() => ctx.setSelectedDoc("demo:rag_explained.md")}
          style={{
            textAlign: "left", padding: 12,
            background: ctx.selectedDoc === "demo:rag_explained.md" ? "var(--accent-soft)" : "var(--panel-alt)",
            color: "var(--text)",
            border: `1.5px solid ${ctx.selectedDoc === "demo:rag_explained.md" ? "var(--accent-dark)" : "var(--border)"}`,
            borderRadius: 8, cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>기술 문서</div>
          <div style={{ fontWeight: 600 }}>RAG 개념 설명 (영문)</div>
        </button>
      </div>
    </div>
  );
}

/* ---------------- News search (bundled + optional NewsAPI) ---------------- */

function NewsSearch({ ctx }: { ctx: LessonCtx }) {
  const [keyword, setKeyword] = useState("AI");
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchNews>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch() {
    setBusy(true); setErr(null);
    try {
      const r = await searchNews({ keyword, news_api_key: ctx.newsApiKey || null });
      setResult(r);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
        <label>
          <div className="muted" style={{ fontSize: 11 }}>키워드</div>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          <div className="muted" style={{ fontSize: 11 }}>NewsAPI 키 (선택)</div>
          <input type="password" value={ctx.newsApiKey}
            onChange={(e) => ctx.setNewsApiKey(e.target.value)}
            placeholder="(비우면 번들 검색만)" style={{ width: "100%" }} />
        </label>
        <button onClick={onSearch} disabled={busy} style={{ alignSelf: "end" }}>
          {busy ? "검색 중…" : "검색"}
        </button>
      </div>
      {err && <pre style={{ color: "var(--err)" }}>{err}</pre>}
      {result && (
        <>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>번들 매칭 ({result.bundled.length})</div>
            {result.bundled.length === 0
              ? <div className="muted" style={{ fontSize: 12 }}>번들 기사에서 일치하는 항목 없음</div>
              : (
                <div style={{ display: "grid", gap: 8 }}>
                  {result.bundled.map((b) => (
                    <div key={b.id} className="panel" style={{ padding: 10 }}>
                      <div style={{ fontSize: 11 }} className="muted">{b.category}</div>
                      <div style={{ fontWeight: 600 }}>{b.title}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{b.snippet}</div>
                      <button style={{ marginTop: 6 }} onClick={() => ctx.setSelectedDoc(b.source)}>
                        이 문서로 실습 →
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>
          {result.live_used && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>NewsAPI 실시간 ({result.live.length})</div>
              {result.live_error && <pre style={{ color: "var(--err)" }}>{result.live_error}</pre>}
              <div style={{ display: "grid", gap: 8 }}>
                {result.live.map((a, i) => <LiveArticleCard key={i} a={a} ctx={ctx} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LiveArticleCard({ a, ctx }: { a: LiveArticle; ctx: LessonCtx }) {
  const inlineText = `${a.title ?? ""}\n\n${a.description ?? ""}\n\n${a.content ?? ""}`.trim();
  return (
    <div className="panel" style={{ padding: 10 }}>
      <div className="muted" style={{ fontSize: 11 }}>
        {a.source ?? "?"} · {a.published_at ?? ""}
      </div>
      <div style={{ fontWeight: 600 }}>{a.title}</div>
      {a.description && <div style={{ fontSize: 12, marginTop: 4 }}>{a.description}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {a.url && <a href={a.url} target="_blank" rel="noreferrer"><button className="btn-secondary">원문 보기</button></a>}
        <button onClick={() => ctx.setSelectedDoc(`text:${inlineText}`)}>
          이 기사 텍스트로 실습 →
        </button>
      </div>
    </div>
  );
}

/* ---------------- Chunk compare (inline) ---------------- */

function ChunkCompare({ source, configs }: { source: string; configs: import("@/lib/api").ChunkConfig[] }) {
  const [results, setResults] = useState<ChunkPreview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(null);
    chunkPreview(source, configs)
      .then((r) => { if (alive) setResults(r.results); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [source, JSON.stringify(configs)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="muted" style={{ fontSize: 12 }}>source: <code>{source}</code></div>
      {busy && <div className="muted">compare 중…</div>}
      {err && <pre style={{ color: "var(--err)" }}>{err}</pre>}
      {results && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${results.length}, minmax(260px, 1fr))`,
          gap: 12,
        }}>
          {results.map((r, i) => (
            <div key={i} className="panel" style={{ display: "grid", gap: 6 }}>
              <strong>{r.config.label}</strong>
              <div className="muted mono" style={{ fontSize: 11 }}>
                {r.config.strategy} · size={r.config.chunk_size} · overlap={r.config.chunk_overlap}
              </div>
              {r.stats && (
                <div className="mono" style={{ fontSize: 12 }}>
                  count=<strong>{r.stats.count}</strong> · mean={r.stats.mean_len} ·
                  min={r.stats.min_len} · max={r.stats.max_len}
                </div>
              )}
              <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {r.chunks?.slice(0, 5).map((c) => (
                  <div key={c.index} style={{
                    border: "1px solid var(--border)", borderRadius: 4, padding: 6,
                  }}>
                    <div className="muted mono" style={{ fontSize: 11 }}>
                      #{c.index} · {c.length}자
                    </div>
                    <div style={{ fontSize: 12.5 }}>{c.preview}</div>
                  </div>
                ))}
                {(r.chunks?.length ?? 0) > 5 && (
                  <div className="muted" style={{ fontSize: 11 }}>
                    … 이하 {(r.chunks!.length - 5)}개 생략
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Run pipeline (inline) ---------------- */

function RunPipeline({ spec, ctx }: { spec: PipelineSpec; ctx: LessonCtx }) {
  const [apiKey] = useApiKey();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onRun() {
    setBusy(true); setErr(null);
    try {
      const r = await runPipeline(spec, apiKey || null);
      ctx.setLastResult(r);
      if (!r.ok) setErr(r.error ?? "unknown error");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        loader source: <code>{(spec.nodes.find((n) => n.type === "loader")?.params as any)?.source}</code> · query: <code>{spec.query}</code>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={onRun} disabled={busy}>
          {busy ? "Running…" : "Run Pipeline"}
        </button>
        {!apiKey && (
          <span className="muted" style={{ fontSize: 12 }}>
            API 키 없음 → 해시 임베딩 + stub 답변으로 흐름만 검증
          </span>
        )}
      </div>
      {err && <pre style={{ color: "var(--err)" }}>{err}</pre>}
      {ctx.lastResult && <TracePanel result={ctx.lastResult} />}
    </div>
  );
}

function TraceOrHint({ ctx }: { ctx: LessonCtx }) {
  if (ctx.lastResult) return <TracePanel result={ctx.lastResult} />;
  return (
    <div className="panel muted">
      아직 실행 결과가 없습니다. 이전 단계에서 "Run Pipeline"을 먼저 눌러 주세요.
    </div>
  );
}

/* ---------------- Generate code ---------------- */

function GenerateCode({ spec, ctx }: { spec: PipelineSpec; ctx: LessonCtx }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onGen() {
    setBusy(true); setErr(null);
    try {
      const r = await codegenPipeline(spec);
      ctx.setLastCode(r.code);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button onClick={onGen} disabled={busy}>
        {busy ? "Generating…" : "Generate Python"}
      </button>
      {err && <pre style={{ color: "var(--err)" }}>{err}</pre>}
      {ctx.lastCode && (
        <div className="panel">
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <strong>Generated Python</strong>
            <span style={{ flex: 1 }} />
            <button
              className="btn-secondary"
              onClick={() => navigator.clipboard.writeText(ctx.lastCode!)}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >Copy</button>
          </div>
          <pre style={{ marginTop: 8 }}>{ctx.lastCode}</pre>
        </div>
      )}
    </div>
  );
}
