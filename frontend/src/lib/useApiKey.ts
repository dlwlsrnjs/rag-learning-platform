"use client";

import { useEffect, useState } from "react";

const LS_KEY = "rag-site:openai-key";

export function useApiKey(): [string, (v: string) => void] {
  const [key, setKey] = useState("");
  useEffect(() => {
    const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_OPENAI_KEY;
    const fromLs = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    setKey(fromLs || fromEnv || "");
  }, []);
  function set(v: string) {
    setKey(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(LS_KEY, v);
      else window.localStorage.removeItem(LS_KEY);
    }
  }
  return [key, set];
}
