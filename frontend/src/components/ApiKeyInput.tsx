"use client";

import { useApiKey } from "@/lib/useApiKey";

export function ApiKeyInput({ hint }: { hint?: string }) {
  const [key, setKey] = useApiKey();
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        OpenAI API Key (BYOK — 브라우저 localStorage에만 저장)
      </span>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={hint ?? "sk-…"}
        style={{ width: "100%" }}
      />
    </label>
  );
}
