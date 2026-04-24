export type NodeSpec = {
  id: string;
  type: "loader" | "chunker" | "embedder" | "retriever" | "generator";
  params: Record<string, unknown>;
};

export type EdgeSpec = { from: string; to: string };

export type PipelineSpec = {
  id?: string;
  name?: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  query?: string;
};

export type TraceEvent = {
  node_id: string;
  node_type: string;
  params: Record<string, unknown>;
  duration_ms: number;
  inputs_summary: Record<string, unknown>;
  outputs_summary: Record<string, unknown>;
  logs: string[];
};

export type RunResult = {
  ok: boolean;
  error?: string;
  trace: TraceEvent[];
  answer: string | null;
};

const BASE = "/api";

export async function runPipeline(spec: PipelineSpec, apiKey: string | null): Promise<RunResult> {
  const res = await fetch(`${BASE}/pipelines/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec, api_key: apiKey || null }),
  });
  if (!res.ok) throw new Error(`run failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function codegenPipeline(spec: PipelineSpec): Promise<{ code: string }> {
  const res = await fetch(`${BASE}/pipelines/codegen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec }),
  });
  if (!res.ok) throw new Error(`codegen failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listDocuments(): Promise<{ documents: { id: string; source: string; chars: number }[] }> {
  const res = await fetch(`${BASE}/documents`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export type ParamSchema = {
  type: "string" | "int" | "float" | "enum";
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
};
export type NodeTypeSchema = {
  description: string;
  params: Record<string, ParamSchema>;
};

export async function getNodeTypes(): Promise<Record<string, NodeTypeSchema>> {
  const res = await fetch(`${BASE}/node-types`);
  if (!res.ok) throw new Error(`node-types failed: ${res.status}`);
  return res.json();
}

export async function getAgentNodeTypes(): Promise<Record<string, NodeTypeSchema>> {
  const res = await fetch(`${BASE}/agent/node-types`);
  if (!res.ok) throw new Error(`agent node-types failed: ${res.status}`);
  return res.json();
}

export type AgentTraceEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string }
  | { type: "assistant"; content: string };

export async function agentCodegen(args: {
  nodes: { id: string; type: string; params: Record<string, unknown> }[];
  query: string;
}): Promise<{ code: string }> {
  const res = await fetch(`${BASE}/agent/codegen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`agent codegen failed: ${res.status}`);
  return res.json();
}

export async function runAgent(args: {
  query: string;
  nodes: { id: string; type: string; params: Record<string, unknown> }[];
  api_key: string;
}): Promise<{
  ok: boolean;
  answer: string | null;
  trace: AgentTraceEvent[];
  tool_nodes_used: string[];
  model: string;
}> {
  const res = await fetch(`${BASE}/agent/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`agent run failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type EmbeddingCompareChunk = {
  rank: number;
  chunk_index: number;
  score: number;
  preview: string;
};
export type EmbeddingCompareModelResult = {
  model: string;
  dim?: number;
  top_chunks: EmbeddingCompareChunk[];
  error?: string;
};

export async function compareEmbeddings(args: {
  source: string;
  query: string;
  models: string[];
  chunk_size?: number;
  chunk_overlap?: number;
  top_k?: number;
  api_key?: string | null;
}): Promise<{
  doc_chars: number;
  total_chunks: number;
  results: EmbeddingCompareModelResult[];
  overlaps: { a: string; b: string; shared: number; total_k: number }[];
}> {
  const res = await fetch(`${BASE}/embedding/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: args.source,
      query: args.query,
      models: args.models,
      chunk_size: args.chunk_size ?? 400,
      chunk_overlap: args.chunk_overlap ?? 40,
      top_k: args.top_k ?? 4,
      api_key: args.api_key ?? null,
    }),
  });
  if (!res.ok) throw new Error(`embedding compare failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type ChunkConfig = {
  label: string;
  strategy: "recursive" | "fixed";
  chunk_size: number;
  chunk_overlap: number;
};

export type ChunkPreview = {
  config: ChunkConfig;
  stats?: { count: number; mean_len: number; min_len: number; max_len: number };
  chunks?: { index: number; length: number; preview: string }[];
  error?: string;
};

export async function chunkPreview(source: string, configs: ChunkConfig[]): Promise<{
  source: string; doc_chars: number; results: ChunkPreview[];
}> {
  const res = await fetch(`${BASE}/chunk/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, configs }),
  });
  if (!res.ok) throw new Error(`chunk preview failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type NewsSample = {
  id: string;
  source: string;
  title: string;
  category: string;
  tags: string[];
  chars: number;
  preview?: string;
  snippet?: string;
  default_query?: string;
};

export type LiveArticle = {
  title: string;
  description: string | null;
  source: string | null;
  published_at: string | null;
  url: string | null;
  content: string;
};

export async function listNewsSamples(): Promise<{ samples: NewsSample[] }> {
  const res = await fetch(`${BASE}/news/samples`);
  if (!res.ok) throw new Error(`news samples failed: ${res.status}`);
  return res.json();
}

export type OptimizePatch = {
  node_id: string;
  node_type: string;
  param: string;
  from: unknown;
  to: unknown;
  reason: string;
};

export async function optimizeSuggestion(args: {
  spec: PipelineSpec;
  trace: TraceEvent[];
  answer: string | null;
  api_key: string;
}): Promise<{
  review: string;
  no_change_needed: boolean;
  patches: OptimizePatch[];
  model: string;
  tokens: { prompt: number | null; completion: number | null };
}> {
  const res = await fetch(`${BASE}/optimize/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`optimize failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function searchNews(args: { keyword: string; news_api_key?: string | null; language?: string; page_size?: number }): Promise<{
  keyword: string;
  bundled: NewsSample[];
  live: LiveArticle[];
  live_error: string | null;
  live_used: boolean;
}> {
  const res = await fetch(`${BASE}/news/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      keyword: args.keyword,
      news_api_key: args.news_api_key ?? null,
      language: args.language ?? "ko",
      page_size: args.page_size ?? 10,
    }),
  });
  if (!res.ok) throw new Error(`news search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

