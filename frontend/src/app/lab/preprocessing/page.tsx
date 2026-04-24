"use client";

import { useMemo, useState } from "react";

/* ---------------- Operations (pure, client-side) ---------------- */

type Op = {
  id: string;
  label: string;
  description: string;
  fn: (text: string) => string;
};

/** Order defined once here — operations are always applied top-to-bottom. */
const OPS: Op[] = [
  {
    id: "fix_mojibake",
    label: "UTF-8 mojibake 복구",
    description: "UTF-8 바이트가 Latin-1로 잘못 디코딩된 깨짐을 되살립니다. 이미 정상이면 변화 없음.",
    fn: (t) => {
      try {
        if (![...t].every((c) => c.charCodeAt(0) < 256)) return t;
        const bytes = new Uint8Array(t.length);
        for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i);
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return t;
      }
    },
  },
  {
    id: "strip_html",
    label: "HTML 태그 제거",
    description: "script·style·noscript를 먼저 제거하고 본문 텍스트만 남깁니다.",
    fn: (t) => {
      if (typeof window === "undefined") return t;
      const doc = new DOMParser().parseFromString(t, "text/html");
      doc.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
      return (doc.body?.textContent ?? "").trim();
    },
  },
  {
    id: "ocr_fix",
    label: "OCR 오인식 규칙 교정",
    description: "숫자 가운데 l → 1, 포1트 → 포인트, 금라 → 금리 같은 전형적 오인식을 바로잡습니다.",
    fn: (t) =>
      t
        .replace(/(\d)l(\d)/g, "$11$2")
        .replace(/\bO(\d)/g, "0$1")
        .replace(/기준금라/g, "기준금리")
        .replace(/포1트/g, "포인트"),
  },
  {
    id: "unwrap_single_newlines",
    label: "단일 줄바꿈 → 공백 (이중은 유지)",
    description: "문장 중간 줄바꿈을 공백으로 풀고, 단락 구분인 이중 줄바꿈은 보존합니다.",
    fn: (t) => t.replace(/(?<!\n)\n(?!\n)/g, " "),
  },
  {
    id: "remove_boilerplate",
    label: "Boilerplate 문구 제거",
    description: "로그인|회원가입, 저작권, '무단 복제 금지' 같은 반복 UI·공지 문구를 지웁니다.",
    fn: (t) => {
      const patterns: RegExp[] = [
        /(로그인|회원가입|고객센터|장바구니)(\s*[|·\/]\s*(로그인|회원가입|고객센터|장바구니))+.*$/gim,
        /©\s*\d{4}[^\n]*/g,
        /All rights reserved\.?/gi,
        /무단\s*(복제|전재)\s*(금지|및\s*재배포\s*금지)\.?/g,
      ];
      return patterns.reduce((s, p) => s.replace(p, ""), t);
    },
  },
  {
    id: "normalize_whitespace",
    label: "연속 공백 압축",
    description: "탭·여러 공백을 하나로 합치고 양끝 공백을 제거합니다. 줄바꿈 유지.",
    fn: (t) =>
      t
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n"),
  },
  {
    id: "dedup_lines",
    label: "반복 라인 제거",
    description: "같은 라인이 여러 번 나오면 한 번만 남깁니다. 빈 줄은 유지.",
    fn: (t) => {
      const seen = new Set<string>();
      return t
        .split("\n")
        .filter((l) => {
          const k = l.trim();
          if (!k) return true;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .join("\n");
    },
  },
  {
    id: "drop_short_lines",
    label: "너무 짧은 라인 제거",
    description: "3자 미만의 라인을 버립니다 (헤더 파편, 숫자 혼자 등).",
    fn: (t) =>
      t
        .split("\n")
        .filter((l) => l.trim().length === 0 || l.trim().length >= 3)
        .join("\n"),
  },
];

/* ---------------- Scenarios ---------------- */

type Scenario = {
  id: string;
  title: string;
  goal: string;
  dirty: string;
  recommended: string[];
  hint: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "pdf-broken",
    title: "PDF: 문장 중간 줄바꿈",
    goal: "문단은 유지, 문장 중간 줄바꿈만 공백으로.",
    dirty:
      "인공지능 기술은 빠르게\n발전하고 있다. 특히 최근에는\n대형 언어 모델이 주목받고 있다.\n\n이러한 변화는 산업 전반에\n영향을 주고 있다.",
    recommended: ["unwrap_single_newlines", "normalize_whitespace"],
    hint: "단일 \\n은 공백으로, \\n\\n은 유지 → 공백 정규화.",
  },
  {
    id: "html-mess",
    title: "HTML 태그 + 반복 boilerplate",
    goal: "본문만 남기고 네비·저작권 제거.",
    dirty:
      '<div class="nav">로그인 | 회원가입 | 고객센터</div>\n<script>track()</script>\n<article><h1>오늘의 뉴스</h1><p>한국은행이 기준금리를 인하했습니다.</p></article>\n© 2025 MyNews. All rights reserved.\n무단 복제 및 재배포 금지.',
    recommended: ["strip_html", "remove_boilerplate", "normalize_whitespace"],
    hint: "HTML 태그 제거 → boilerplate 청소 → 공백 정규화.",
  },
  {
    id: "mojibake",
    title: "UTF-8 mojibake",
    goal: "깨진 바이트를 올바른 인코딩으로 복원.",
    dirty: "ì¸ê³µì§ë¥ ê¸°ì ì ë¹ ë¥´ê² ë°ì ì¤ì´ë¤.",
    recommended: ["fix_mojibake"],
    hint: "mojibake 복구 하나면 충분.",
  },
  {
    id: "ocr",
    title: "OCR 오인식 교정",
    goal: "반복되는 오인식 패턴을 규칙으로 교정.",
    dirty: "한국은행은 기준금라를 0.25%포1트 인하했다.\n이번 결정으로 국고채3년물 금리가 하락했다.",
    recommended: ["ocr_fix"],
    hint: "OCR 규칙 교정 하나면 충분.",
  },
  {
    id: "dedup",
    title: "반복 공지 라인",
    goal: "매 문단마다 반복되는 공지를 한 번만.",
    dirty:
      "본문 A의 요점입니다.\n공지: 무단 복제 금지\n본문 B의 요점입니다.\n공지: 무단 복제 금지\n본문 C의 요점입니다.\n공지: 무단 복제 금지",
    recommended: ["dedup_lines"],
    hint: "반복 라인 제거 하나면 충분.",
  },
];

/* ---------------- Page ---------------- */

export default function PreprocessingLabPage() {
  const [input, setInput] = useState<string>(SCENARIOS[0].dirty);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  const [showHint, setShowHint] = useState(false);

  const currentScenario = SCENARIOS.find((s) => s.id === scenarioId) ?? null;

  /** Output is recomputed on every input/enabled change. Ops always apply in OPS array order. */
  const output = useMemo(() => {
    let t = input;
    for (const op of OPS) {
      if (enabled[op.id]) t = op.fn(t);
    }
    return t;
  }, [input, enabled]);

  const activeCount = Object.values(enabled).filter(Boolean).length;
  const delta = output.length - input.length;

  function loadScenario(s: Scenario) {
    setScenarioId(s.id);
    setInput(s.dirty);
    setEnabled({});
    setShowHint(false);
  }
  function toggleOp(id: string) {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function applyRecommended() {
    if (!currentScenario) return;
    const r: Record<string, boolean> = {};
    for (const id of currentScenario.recommended) r[id] = true;
    setEnabled(r);
  }
  function clearAll() {
    setEnabled({});
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h1 style={{ margin: 0 }}>전처리 실습실</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 780 }}>
          시나리오를 하나 고르고, 아래에서 필요한 전처리를 <strong>체크</strong>만 하면
          오른쪽 결과가 즉시 바뀝니다.
        </p>
      </section>

      {/* Scenario picker */}
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <strong>시나리오 선택</strong>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8,
        }}>
          {SCENARIOS.map((s) => {
            const active = s.id === scenarioId;
            return (
              <button
                key={s.id}
                onClick={() => loadScenario(s)}
                className={active ? undefined : "btn-secondary"}
                style={{ textAlign: "left", padding: "8px 10px" }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{s.goal}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Input / output side-by-side */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="panel" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong>입력</strong>
            <span className="muted" style={{ fontSize: 12 }}>(편집하면 즉시 반영)</span>
            <span style={{ flex: 1 }} />
            <span className="muted mono" style={{ fontSize: 11 }}>
              {input.length.toLocaleString()}자
            </span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={12}
            style={{ width: "100%" }}
          />
        </div>
        <div className="panel" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong>결과</strong>
            {activeCount > 0 && (
              <span className="badge badge-beginner">{activeCount}개 전처리 적용 중</span>
            )}
            <span style={{ flex: 1 }} />
            <span className="muted mono" style={{ fontSize: 11 }}>
              {output.length.toLocaleString()}자 ({delta >= 0 ? "+" : ""}{delta})
            </span>
          </div>
          <pre style={{
            minHeight: 260, maxHeight: 360, overflow: "auto",
            whiteSpace: "pre-wrap",
          }}>
            {output || "(입력이 비어 있습니다)"}
          </pre>
        </div>
      </section>

      {/* Checkbox list */}
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong>적용할 전처리 (체크하면 바로 반영)</strong>
          <span className="muted" style={{ fontSize: 12 }}>· 순서는 자동으로 아래 목록 순서</span>
          <span style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={() => setShowHint((v) => !v)}
            style={{ fontSize: 12, padding: "4px 10px" }}>
            {showHint ? "힌트 닫기" : "힌트"}
          </button>
          <button className="btn-secondary" onClick={clearAll}
            style={{ fontSize: 12, padding: "4px 10px" }}
            disabled={activeCount === 0}>
            모두 해제
          </button>
          <button onClick={applyRecommended}
            style={{ fontSize: 12, padding: "4px 10px" }}>
            ✓ 추천 설정 적용
          </button>
        </div>
        {showHint && currentScenario && (
          <div style={{
            padding: 10, borderRadius: 8, background: "var(--accent-soft)",
            fontSize: 13, border: "1px solid var(--accent)",
          }}>
            💡 {currentScenario.hint}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 8,
        }}>
          {OPS.map((op) => {
            const on = !!enabled[op.id];
            return (
              <label
                key={op.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px 1fr",
                  gap: 10,
                  alignItems: "start",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  background: on ? "var(--accent-soft)" : "var(--panel)",
                  cursor: "pointer",
                  transition: "background 0.1s, border-color 0.1s",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleOp(op.id)}
                  style={{
                    width: 18, height: 18, marginTop: 2,
                    accentColor: "var(--accent-dark)",
                    cursor: "pointer",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{op.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {op.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Generated Python */}
      <details className="panel">
        <summary className="muted" style={{ cursor: "pointer" }}>
          같은 파이프라인을 Python으로 보고 싶다면
        </summary>
        <pre style={{ marginTop: 10, fontSize: 12 }}>
{generatePython(enabled)}
        </pre>
      </details>
    </div>
  );
}

function generatePython(enabled: Record<string, boolean>): string {
  const enabledIds = OPS.filter((o) => enabled[o.id]).map((o) => o.id);
  const lines: string[] = [
    "# 지금 화면에서 만든 것과 동일한 전처리 파이프라인의 Python 버전",
    "import re",
    "",
  ];
  const map: Record<string, string[]> = {
    fix_mojibake: [
      "def fix_mojibake(t: str) -> str:",
      "    try:",
      "        return t.encode('latin-1').decode('utf-8')",
      "    except Exception:",
      "        return t",
    ],
    strip_html: [
      "from bs4 import BeautifulSoup",
      "def strip_html(t: str) -> str:",
      "    soup = BeautifulSoup(t, 'html.parser')",
      "    for tag in soup(['script', 'style', 'noscript']):",
      "        tag.decompose()",
      "    return soup.get_text().strip()",
    ],
    ocr_fix: [
      "def ocr_fix(t: str) -> str:",
      "    t = re.sub(r'(\\d)l(\\d)', r'\\g<1>1\\g<2>', t)",
      "    t = re.sub(r'\\bO(\\d)', r'0\\1', t)",
      "    t = t.replace('기준금라', '기준금리').replace('포1트', '포인트')",
      "    return t",
    ],
    unwrap_single_newlines: [
      "def unwrap_single_newlines(t: str) -> str:",
      "    return re.sub(r'(?<!\\n)\\n(?!\\n)', ' ', t)",
    ],
    remove_boilerplate: [
      "BOILERPLATE = [",
      "    re.compile(r'(로그인|회원가입|고객센터|장바구니)(\\s*[|·/]\\s*(로그인|회원가입|고객센터|장바구니))+.*$', re.M),",
      "    re.compile(r'©\\s*\\d{4}[^\\n]*'),",
      "    re.compile(r'All rights reserved\\.?', re.I),",
      "    re.compile(r'무단\\s*(복제|전재)\\s*(금지|및\\s*재배포\\s*금지)\\.?'),",
      "]",
      "def remove_boilerplate(t: str) -> str:",
      "    for p in BOILERPLATE:",
      "        t = p.sub('', t)",
      "    return t",
    ],
    normalize_whitespace: [
      "def normalize_whitespace(t: str) -> str:",
      "    lines = [re.sub(r'[ \\t]+', ' ', l).strip() for l in t.split('\\n')]",
      "    return re.sub(r'\\n{3,}', '\\n\\n', '\\n'.join(lines))",
    ],
    dedup_lines: [
      "def dedup_lines(t: str) -> str:",
      "    seen, out = set(), []",
      "    for l in t.split('\\n'):",
      "        k = l.strip()",
      "        if not k: out.append(l); continue",
      "        if k in seen: continue",
      "        seen.add(k); out.append(l)",
      "    return '\\n'.join(out)",
    ],
    drop_short_lines: [
      "def drop_short_lines(t: str) -> str:",
      "    return '\\n'.join(l for l in t.split('\\n') if len(l.strip()) == 0 or len(l.strip()) >= 3)",
    ],
  };
  for (const id of enabledIds) {
    const body = map[id];
    if (body) lines.push(...body, "");
  }
  lines.push("def pipeline(t: str) -> str:");
  if (enabledIds.length === 0) {
    lines.push("    return t  # (아직 선택된 전처리가 없습니다)");
  } else {
    for (const id of enabledIds) lines.push(`    t = ${id}(t)`);
    lines.push("    return t");
  }
  lines.push("", "if __name__ == '__main__':", "    import sys", "    print(pipeline(sys.stdin.read()))");
  return lines.join("\n");
}
