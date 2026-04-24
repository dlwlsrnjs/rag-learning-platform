/** Read an NDJSON stream (one JSON object per line) as an async generator. */
export async function* streamNDJSON<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  init?: RequestInit,
): AsyncGenerator<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`stream failed: ${res.status} ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as T;
      } catch {
        // Ignore malformed lines rather than kill the whole stream.
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try { yield JSON.parse(tail) as T; } catch {}
  }
}

/** Common event shape the backend emits across all /stream endpoints. */
export type StreamEvent =
  | { type: "start"; title?: string; total?: number; [k: string]: unknown }
  | { type: "log"; message: string; level?: "info" | "warn" | "error" }
  | { type: "stage_start"; id: string; label?: string; index?: number; total?: number }
  | { type: "stage_end"; id: string; duration_ms?: number; summary?: string; logs?: string[]; outputs_summary?: Record<string, unknown> }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string }
  | { type: "assistant"; content: string }
  | { type: "error"; message: string; stage?: string }
  | { type: "done"; result: unknown };
