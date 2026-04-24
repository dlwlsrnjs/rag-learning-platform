"use client";

import { useEffect, useState } from "react";
import {
  listNewsSamples,
  type EmbeddingCompareModelResult, type NewsSample,
} from "@/lib/api";
import { streamNDJSON, type StreamEvent } from "@/lib/stream";
import { useApiKey } from "@/lib/useApiKey";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { LoadingOverlay, useStreamOverlay } from "@/components/LoadingOverlay";

const ALL_MODELS = [
  { id: "text-embedding-3-small", label: "OpenAI · 3-small", desc: "저렴·빠름·영문 기본기 강함" },
  { id: "text-embedding-3-large", label: "OpenAI · 3-large", desc: "비싸지만 미묘한 의미 구분 유리" },
  { id: "hash", label: "Hash (더미)", desc: "의미 없음. 배선 검증용" },
];

export default function EmbeddingLabPage() {
  const [apiKey] = useApiKey();
  const { run: runWithOverlay, overlayProps } = useStreamOverlay();
  const [samples, setSamples] = useState<NewsSample[]>([]);
  const [source, setSource] = useState("demo:news_ai_ethics_kr.md");
  const [query, setQuery] = useState("가이드라인에 참여한 기업들과 다섯 가지 원칙은 무엇인가?");
  const [models, setModels] = useState<string[]>(["text-embedding-3-small", "hash"]);
  const [topK, setTopK] = useState(4);
  const [chunkSize, setChunkSize] = useState(400);
  const [chunkOverlap, setChunkOverlap] = useState(40);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  type CompareResult = {
    doc_chars: number;
    total_chunks: number;
    results: EmbeddingCompareModelResult[];
    overlaps: { a: string; b: string; shared: number; total_k: number }[];
  };
  const [data, setData] = useState<CompareResult | null>(null);

  useEffect(() => {
    listNewsSamples().then((r) => setSamples(r.samples)).catch(() => {});
  }, []);

  // Auto-update query when source changes to a known sample.
  useEffect(() => {
    const m = samples.find((s) => s.source === source);
    if (m?.default_query) setQuery(m.default_query);
  }, [source, samples]);

  function toggleModel(id: string) {
    setModels((ms) => ms.includes(id) ? ms.filter((m) => m !== id) : [...ms, id]);
  }

  async function onRun() {
    if (models.length === 0) { setErr("최소 한 개 모델을 선택하세요."); return; }
    setBusy(true); setErr(null); setData(null);
    const stream = streamNDJSON<StreamEvent>("/api/embedding/compare/stream", {
      source, query, models, top_k: topK,
      chunk_size: chunkSize, chunk_overlap: chunkOverlap,
      api_key: apiKey || null,
    });
    const res = await runWithOverlay<CompareResult>("임베딩 모델 비교", stream);
    if (res.result) setData(res.result);
    else if (res.error) setErr(res.error);
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h1 style={{ margin: 0 }}>Embedding Lab</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 760 }}>
          같은 문서·같은 질문에 <strong>여러 임베딩 모델</strong>을 돌려 상위 청크를 나란히 비교합니다.
          모델마다 가져오는 청크가 얼마나 다른지, 실제로 비용을 더 써야 할 만한 차이가 있는지 눈으로 확인해 보세요.
        </p>
      </section>

      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>문서</div>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={{ width: "100%" }}>
              {samples.map((s) => <option key={s.id} value={s.source}>{s.title}</option>)}
              <option value="demo:rag_explained.md">RAG 개념 설명 (영문)</option>
              <option value="demo:ai_intro.md">AI 소개 (영문)</option>
            </select>
          </label>
          <ApiKeyInput />
        </div>

        <label>
          <div className="muted" style={{ fontSize: 12 }}>질문</div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
        </label>

        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>비교할 모델</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
            {ALL_MODELS.map((m) => {
              const active = models.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  className={active ? undefined : "btn-secondary"}
                  style={{ textAlign: "left", padding: 10 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {active ? "✓ " : ""}{m.label}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
          {!apiKey && models.some((m) => m !== "hash") && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ⚠️ OpenAI 모델을 쓰려면 키를 상단에 입력하세요. 키 없이는 hash 모델만 동작합니다.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>top_k</div>
            <input type="number" value={topK} min={1} max={10}
              onChange={(e) => setTopK(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              style={{ width: "100%" }} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>chunk_size</div>
            <input type="number" value={chunkSize} min={100} max={2000}
              onChange={(e) => setChunkSize(Number(e.target.value) || 400)}
              style={{ width: "100%" }} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>chunk_overlap</div>
            <input type="number" value={chunkOverlap} min={0} max={400}
              onChange={(e) => setChunkOverlap(Number(e.target.value) || 0)}
              style={{ width: "100%" }} />
          </label>
        </div>

        <div>
          <button onClick={onRun} disabled={busy}>
            {busy ? "비교 중…" : "비교 실행"}
          </button>
        </div>
        {err && <pre style={{ color: "var(--err)" }}>{err}</pre>}
      </section>

      {data && (
        <section>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            전체 청크 {data.total_chunks}개 · 문서 {data.doc_chars}자
          </div>

          {data.overlaps.length > 0 && (
            <div className="panel" style={{ marginBottom: 12, background: "var(--accent-soft)" }}>
              <strong>교집합:</strong>{" "}
              {data.overlaps.map((o, i) => (
                <span key={i} style={{ marginRight: 14 }}>
                  <code>{o.a}</code> ∩ <code>{o.b}</code> = <strong>{o.shared}</strong>/{o.total_k}
                </span>
              ))}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                두 모델이 top-{data.overlaps[0]?.total_k}에서 공통으로 고른 청크 수. 낮을수록 모델 차이가 실질적으로 큽니다.
              </div>
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${data.results.length}, minmax(280px, 1fr))`,
            gap: 12,
          }}>
            {data.results.map((r) => <ModelColumn key={r.model} r={r} />)}
          </div>
        </section>
      )}

      <LoadingOverlay {...overlayProps} />
    </div>
  );
}

function ModelColumn({ r }: { r: EmbeddingCompareModelResult }) {
  return (
    <div className="panel" style={{ display: "grid", gap: 8 }}>
      <div>
        <strong>{r.model}</strong>
        {r.dim && <span className="muted mono" style={{ fontSize: 11, marginLeft: 8 }}>dim={r.dim}</span>}
      </div>
      {r.error ? (
        <pre style={{ color: "var(--err)", fontSize: 12 }}>{r.error}</pre>
      ) : (
        r.top_chunks.map((c) => (
          <div key={c.rank} style={{
            border: "1px solid var(--border)", borderRadius: 6, padding: 8,
          }}>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4 }}>
              <strong style={{ color: "var(--accent-dark)" }}>#{c.rank}</strong>
              <span className="muted mono" style={{ fontSize: 11 }}>chunk {c.chunk_index}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 11 }}>sim={c.score}</span>
            </div>
            <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{c.preview}</div>
          </div>
        ))
      )}
    </div>
  );
}
