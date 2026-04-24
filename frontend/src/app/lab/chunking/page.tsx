"use client";

import { useEffect, useState } from "react";
import { chunkPreview, listDocuments, type ChunkConfig, type ChunkPreview } from "@/lib/api";

const DEFAULT_CONFIGS: ChunkConfig[] = [
  { label: "recursive 300/30", strategy: "recursive", chunk_size: 300, chunk_overlap: 30 },
  { label: "recursive 600/60", strategy: "recursive", chunk_size: 600, chunk_overlap: 60 },
  { label: "fixed 400/0",     strategy: "fixed",     chunk_size: 400, chunk_overlap: 0 },
];

export default function ChunkingLabPage() {
  const [docs, setDocs] = useState<{ source: string }[]>([]);
  const [source, setSource] = useState("demo:rag_explained.md");
  const [configs, setConfigs] = useState<ChunkConfig[]>(DEFAULT_CONFIGS);
  const [results, setResults] = useState<ChunkPreview[] | null>(null);
  const [docChars, setDocChars] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listDocuments().then((r) => setDocs(r.documents)).catch(() => {});
  }, []);

  async function onCompare() {
    setBusy(true); setErr(null); setResults(null);
    try {
      const r = await chunkPreview(source, configs);
      setResults(r.results);
      setDocChars(r.doc_chars);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function updateConfig(i: number, patch: Partial<ChunkConfig>) {
    setConfigs((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addConfig() {
    setConfigs((cs) => [...cs, {
      label: `config ${cs.length + 1}`, strategy: "recursive", chunk_size: 500, chunk_overlap: 50,
    }]);
  }
  function removeConfig(i: number) {
    setConfigs((cs) => cs.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h1 style={{ margin: 0 }}>Chunking Lab</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 760 }}>
          같은 문서에 여러 청킹 설정을 적용해 결과를 나란히 비교합니다.
          <strong> 작은 청크</strong>는 정확도에 유리하지만 문맥이 부족하고,
          <strong> 큰 청크</strong>는 문맥이 풍부하지만 검색 점수가 희석됩니다.
          300–800자·10–20% 오버랩에서 시작해 보세요.
        </p>
      </section>

      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>Source document</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {docs.length === 0
              ? <option value={source}>{source}</option>
              : docs.map((d) => <option key={d.source} value={d.source}>{d.source}</option>)}
          </select>
        </label>

        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Configurations</div>
          <div style={{ display: "grid", gap: 8 }}>
            {configs.map((c, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr auto",
                gap: 8, alignItems: "end",
              }}>
                <label>
                  <div className="muted" style={{ fontSize: 11 }}>label</div>
                  <input value={c.label} onChange={(e) => updateConfig(i, { label: e.target.value })} style={{ width: "100%" }} />
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 11 }}>strategy</div>
                  <select value={c.strategy} onChange={(e) => updateConfig(i, { strategy: e.target.value as ChunkConfig["strategy"] })} style={{ width: "100%" }}>
                    <option value="recursive">recursive</option>
                    <option value="fixed">fixed</option>
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 11 }}>size</div>
                  <input type="number" value={c.chunk_size}
                    onChange={(e) => updateConfig(i, { chunk_size: Number(e.target.value) })}
                    style={{ width: "100%" }} />
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 11 }}>overlap</div>
                  <input type="number" value={c.chunk_overlap}
                    onChange={(e) => updateConfig(i, { chunk_overlap: Number(e.target.value) })}
                    style={{ width: "100%" }} />
                </label>
                <button onClick={() => removeConfig(i)} disabled={configs.length <= 1} className="btn-secondary">−</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={addConfig} className="btn-secondary">+ config</button>
            <button onClick={onCompare} disabled={busy}>{busy ? "Comparing…" : "Compare"}</button>
          </div>
        </div>

        {err && <pre style={{ color: "var(--err)", whiteSpace: "pre-wrap" }}>{err}</pre>}
      </section>

      {results && (
        <section>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            document chars: {docChars}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${results.length}, minmax(280px, 1fr))`,
            gap: 12,
            overflowX: "auto",
          }}>
            {results.map((r, i) => (
              <div key={i} className="panel" style={{ display: "grid", gap: 8 }}>
                <div>
                  <strong>{r.config.label}</strong>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {r.config.strategy} · size={r.config.chunk_size} · overlap={r.config.chunk_overlap}
                  </div>
                </div>
                {r.error ? (
                  <pre style={{ color: "var(--err)" }}>{r.error}</pre>
                ) : (
                  <>
                    <div className="mono" style={{ fontSize: 12 }}>
                      count: <strong>{r.stats!.count}</strong> · mean: {r.stats!.mean_len} ·
                      min: {r.stats!.min_len} · max: {r.stats!.max_len}
                    </div>
                    <div style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
                      {r.chunks!.map((c) => (
                        <div key={c.index} style={{
                          border: "1px solid var(--border)", borderRadius: 4, padding: 8,
                        }}>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            #{c.index} · {c.length} chars
                          </div>
                          <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{c.preview}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
