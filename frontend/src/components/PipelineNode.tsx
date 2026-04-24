"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeTypeSchema, ParamSchema, TraceEvent } from "@/lib/api";
import { ParamHelp } from "./ParamHelp";

export type PipelineNodeData = {
  nodeType: string;
  nodeId: string;
  params: Record<string, unknown>;
  schema: NodeTypeSchema | undefined;
  onParamsChange: (patch: Record<string, unknown>) => void;
  traceEvent?: TraceEvent;
  traceStatus?: "idle" | "running" | "ok" | "error";
  /** Optional: if provided, a × button appears in the header to remove this node. */
  onRemove?: () => void;
  /** Free-form tag for tools (e.g., "tool calls=2") shown under header. */
  statusHint?: string;
};

const TYPE_COLORS: Record<string, string> = {
  loader: "#5fa978",
  chunker: "#d9a74c",
  embedder: "#6a8ad6",
  retriever: "#9178c9",
  generator: "#d17575",
  agent: "#2d6b4a",
  tool_calculator: "#d9a74c",
  tool_rag_retrieve: "#9178c9",
  tool_read_demo_doc: "#6a8ad6",
  tool_word_count: "#d17575",
};

const TYPE_BG: Record<string, string> = {
  loader: "#eaf5ee",
  chunker: "#fbf1dd",
  embedder: "#e6ecf8",
  retriever: "#ece6f6",
  generator: "#f7e5e5",
  agent: "#d9eedf",
  tool_calculator: "#fbf1dd",
  tool_rag_retrieve: "#ece6f6",
  tool_read_demo_doc: "#e6ecf8",
  tool_word_count: "#f7e5e5",
};

export function PipelineNode({ data }: NodeProps) {
  const d = data as unknown as PipelineNodeData;
  const color = TYPE_COLORS[d.nodeType] ?? "#888";
  const status = d.traceStatus ?? "idle";
  const borderColor =
    status === "error" ? "var(--err)" :
    status === "ok" ? "var(--accent-dark)" :
    status === "running" ? "var(--warn)" :
    color;

  return (
    <div
      style={{
        background: "var(--panel)",
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        minWidth: 248,
        fontSize: 12,
        boxShadow: "0 2px 6px rgba(30, 42, 36, 0.06)",
        transition: "border-color 0.2s",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 10, height: 10 }} />
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid var(--border)`,
        background: TYPE_BG[d.nodeType] ?? "var(--panel-alt)",
        borderRadius: "8px 8px 0 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: 4, background: color,
          }} />
          <strong style={{ color }}>{d.nodeType}</strong>
          <span className="muted mono" style={{ fontSize: 11 }}>{d.nodeId}</span>
          <span style={{ flex: 1 }} />
          <StatusBadge status={status} />
          {d.onRemove && (
            <button
              className="nodrag"
              onClick={(e) => { e.stopPropagation(); d.onRemove?.(); }}
              aria-label="노드 제거"
              title="이 노드 제거"
              style={{
                background: "transparent", color: "var(--muted)",
                border: "none", padding: 0, marginLeft: 4,
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        {d.schema?.description && (
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {d.schema.description}
          </div>
        )}
        {d.statusHint && (
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--accent-dark)", fontWeight: 600 }}>
            {d.statusHint}
          </div>
        )}
      </div>
      <div style={{ padding: 10, display: "grid", gap: 6 }}>
        {d.schema
          ? Object.entries(d.schema.params).map(([name, spec]) => (
              <ParamField
                key={name}
                name={name}
                nodeType={d.nodeType}
                spec={spec}
                value={d.params[name] ?? spec.default}
                onChange={(v) => d.onParamsChange({ [name]: v })}
              />
            ))
          : <div className="muted">schema loading…</div>}
      </div>
      {d.traceEvent && (
        <TraceOutput event={d.traceEvent} nodeType={d.nodeType} />
      )}
      <Handle type="source" position={Position.Right} style={{ background: color, width: 10, height: 10 }} />
    </div>
  );
}

function StatusBadge({ status }: { status: "idle" | "running" | "ok" | "error" }) {
  if (status === "idle") return null;
  const map = {
    running: { label: "…", bg: "var(--warn)", fg: "#5a3f00" },
    ok: { label: "✓", bg: "var(--accent)", fg: "#0f2418" },
    error: { label: "✗", bg: "var(--err)", fg: "white" },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 18, height: 18, borderRadius: 9,
      background: map.bg, color: map.fg, fontSize: 11, fontWeight: 800,
    }}>
      {map.label}
    </span>
  );
}

function TraceOutput({ event, nodeType }: { event: TraceEvent; nodeType: string }) {
  const out = event.outputs_summary as Record<string, any>;
  const lines: string[] = [];
  if (nodeType === "loader" && out.documents) {
    const totalChars = (out.documents as any[]).reduce((s, d) => s + (d.chars ?? 0), 0);
    lines.push(`${out.documents.length}개 문서 · ${totalChars.toLocaleString()}자`);
  }
  if (nodeType === "chunker" && typeof out.chunks === "number") {
    lines.push(`청크 ${out.chunks}개 생성`);
  }
  if (nodeType === "embedder" && typeof out.embeddings === "number") {
    lines.push(`${out.embeddings}개 벡터`);
  }
  if (nodeType === "retriever" && Array.isArray(out.retrieved)) {
    lines.push(`top-${out.retrieved.length} 검색됨`);
  }
  if (nodeType === "generator" && out.answer_preview) {
    const preview = String(out.answer_preview).slice(0, 80);
    lines.push(`답변: ${preview}${out.answer_preview.length > 80 ? "…" : ""}`);
  }
  return (
    <div style={{
      padding: "8px 10px",
      borderTop: `1px dashed var(--border)`,
      background: "var(--accent-soft)",
      fontSize: 11,
      display: "grid",
      gap: 2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 700, color: "var(--accent-dark)" }}>결과</span>
        <span style={{ flex: 1 }} />
        <span className="muted mono" style={{ fontSize: 10.5 }}>
          {event.duration_ms.toFixed(1)} ms
        </span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: "var(--text)" }}>{l}</div>
      ))}
      {event.logs.slice(0, 1).map((l, i) => (
        <div key={`log-${i}`} className="mono muted" style={{ fontSize: 10.5 }}>
          · {l}
        </div>
      ))}
    </div>
  );
}

function ParamField({
  name, nodeType, spec, value, onChange,
}: {
  name: string;
  nodeType: string;
  spec: ParamSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <span className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {name}
      <ParamHelp nodeType={nodeType} paramName={name} />
    </span>
  );
  const common = { style: { width: "100%" }, className: "nodrag" as const };

  // Compact display for long "text:..." sources from upload/paste
  if (name === "source" && typeof value === "string" && value.startsWith("text:") && value.length > 60) {
    const chars = value.length - "text:".length;
    return (
      <label style={{ display: "grid", gap: 2 }}>
        {label}
        <div className="mono" style={{
          padding: "6px 8px", background: "var(--accent-soft)",
          border: "1px solid var(--accent)", borderRadius: 6,
          fontSize: 11, color: "var(--accent-dark)",
        }}>
          📄 inline text · {chars.toLocaleString()}자
        </div>
      </label>
    );
  }

  if (spec.type === "enum") {
    return (
      <label style={{ display: "grid", gap: 2 }}>
        {label}
        <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(spec.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (spec.type === "int" || spec.type === "float") {
    return (
      <label style={{ display: "grid", gap: 2 }}>
        {label}
        <input
          {...common}
          type="number"
          step={spec.type === "int" ? 1 : 0.1}
          min={spec.min}
          max={spec.max}
          value={typeof value === "number" ? value : Number(value ?? 0)}
          onChange={(e) => {
            const n = e.target.value === "" ? 0 : Number(e.target.value);
            onChange(spec.type === "int" ? Math.round(n) : n);
          }}
        />
      </label>
    );
  }
  return (
    <label style={{ display: "grid", gap: 2 }}>
      {label}
      <input
        {...common}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
