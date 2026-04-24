"use client";

import type { RunResult } from "@/lib/api";

export function TracePanel({ result }: { result: RunResult }) {
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
