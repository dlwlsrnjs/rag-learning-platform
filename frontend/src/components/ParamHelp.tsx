"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type HelpEntry = {
  what: string;
  when?: string;
  tip?: string;
};

export const PARAM_HELP: Record<string, HelpEntry> = {
  "loader.source": {
    what: "로더가 읽어들일 문서의 출처. demo:<파일명> 또는 text:<인라인 내용> 형식입니다.",
    when: "보통 위쪽의 '문서 소스' 패널에서 자동으로 세팅되지만, 직접 수정도 가능합니다.",
    tip: "업로드·붙여넣기로 설정한 경우 이 필드는 📄 inline text 요약으로 표시됩니다.",
  },
  "chunker.strategy": {
    what: "문서를 나누는 방식. recursive는 문단·문장 경계를 먼저 존중하면서 크기 제한을 맞추고, fixed는 경계와 상관없이 고정 길이로 자릅니다.",
    when: "한국어·영어 일반 텍스트는 거의 항상 recursive가 유리. 동일 길이의 청크가 꼭 필요한 벤치마크나 빠른 스케치에만 fixed를 사용.",
    tip: "기본값 recursive로 시작하세요.",
  },
  "chunker.chunk_size": {
    what: "한 청크에 담을 최대 문자 수.",
    when: "너무 작으면(200~) 문맥이 부족해 답이 빈약해지고, 너무 크면(1000+) 관련 없는 내용이 섞여 유사도 점수가 희석됩니다.",
    tip: "한국어 뉴스·블로그: 400~600, 법률·논문: 600~1000.",
  },
  "chunker.chunk_overlap": {
    what: "이웃한 청크가 겹치는 길이. 문장 경계에 걸친 정보가 잘려 나가는 걸 방지합니다.",
    when: "0이면 경계 정보 손실 가능. 너무 크면 중복이 많아져 검색·비용 효율이 떨어집니다.",
    tip: "chunk_size의 10~15% (예: 500 → 50~75).",
  },
  "embedder.provider": {
    what: "임베딩 벡터를 만드는 방식. openai는 실제 API 호출, hash는 해시 기반 더미(의미 없음).",
    when: "키 없이 파이프라인 흐름만 검증할 땐 hash. 실제 의미 검색은 openai.",
    tip: "hash는 검색 품질이 랜덤에 가까우므로 배선 검증 용도로만 쓰세요.",
  },
  "embedder.model": {
    what: "사용할 OpenAI 임베딩 모델 이름.",
    when: "text-embedding-3-small은 저렴·빠름·영문 기본기 강함. text-embedding-3-large는 더 비싸지만 미세한 의미 구분이 필요할 때 유리.",
    tip: "small로 시작하고, 품질이 부족하면 large로 업그레이드.",
  },
  "retriever.top_k": {
    what: "검색 시 가져올 상위 청크 개수.",
    when: "2~3은 정확도↑·누락 가능성↑. 5~10은 재현율↑ 이지만 LLM 컨텍스트·비용이 늘어납니다.",
    tip: "짧은 문서·단답형은 3, 긴 문서·여러 사실을 묻는 질문은 5~7.",
  },
  "retriever.provider": {
    what: "질문을 임베딩할 제공자. 반드시 embedder와 같아야 벡터 공간이 맞습니다.",
    when: "embedder가 openai면 여기도 openai, hash면 여기도 hash.",
  },
  "retriever.model": {
    what: "질문 임베딩에 쓸 모델. 반드시 embedder.model과 동일해야 합니다.",
    when: "embedder.model을 바꾸면 여기도 함께 바꿔 주세요. 다르면 두 벡터가 같은 공간에 없어 검색이 무의미해집니다.",
  },
  "generator.provider": {
    what: "답변을 만드는 방식. openai는 실제 GPT 호출, stub은 검색된 청크를 그대로 보여줌.",
    when: "키 없이 파이프라인 흐름만 확인할 땐 stub. 실제 답이 필요하면 openai.",
  },
  "generator.model": {
    what: "답변 생성용 LLM 이름.",
    when: "gpt-4o-mini는 저렴·빠름·학습용 RAG에 충분. gpt-4o는 복잡한 추론이나 긴 컨텍스트가 필요할 때.",
    tip: "학습·실습에는 mini로 충분합니다.",
  },
  "generator.temperature": {
    what: "답변의 다양성·창의성 정도. 0에 가까우면 결정론적, 1은 기본, 2는 매우 자유.",
    when: "사실 중심 RAG 답변은 낮게(0~0.3) 두는 것이 안전. 창의적 응답이 필요할 때만 0.7 이상.",
    tip: "RAG은 근거 기반이어야 하므로 기본 0.2 권장.",
  },
  // --- LangGraph agent ---
  "agent.model": {
    what: "ReAct 에이전트가 쓸 LLM 모델.",
    when: "gpt-4o-mini는 저렴·빠름, 학습·데모에 충분. 복잡한 다단계 추론이나 긴 컨텍스트가 필요하면 gpt-4o.",
    tip: "대부분의 툴 예시는 mini로 충분히 돌아갑니다.",
  },
  "agent.temperature": {
    what: "답변의 다양성. 0에 가까울수록 결정적.",
    when: "에이전트가 '어떤 툴을 언제 부를지' 판단도 샘플링이라, 너무 높으면 불필요한 툴 호출이 늡니다.",
    tip: "기본 0.2. 실험이 아니면 그대로 두세요.",
  },
  "agent.system_prompt": {
    what: "에이전트에게 주는 시스템 지시문(역할·행동 규칙).",
    when: "특정 스타일의 답변이나 툴 사용 규칙을 강제하고 싶을 때 수정. 빈 값으로 두면 기본 한국어 조수 프롬프트.",
    tip: "툴 호출 조건을 명시하면 정확도가 올라갑니다. 예: '수치가 나오면 반드시 calculator 사용'.",
  },
  // --- Tool: rag_retrieve ---
  "tool_rag_retrieve.source": {
    what: "검색할 데모 문서. demo:<파일명> 형식.",
    when: "에이전트가 이 툴을 호출하면 자동으로 이 문서에서 검색합니다. 여러 소스가 필요하면 툴을 여러 개 추가하세요.",
  },
  "tool_rag_retrieve.top_k": {
    what: "검색에서 반환할 청크 개수.",
    when: "짧은 답에는 2~3, 여러 사실을 엮어야 하면 5~7.",
    tip: "에이전트는 너무 많은 컨텍스트를 주면 오히려 혼란할 수 있어요. 3~5 권장.",
  },
  "tool_rag_retrieve.chunk_size": {
    what: "청킹 시 한 청크의 최대 길이.",
    when: "한국어 뉴스 400~600, 법률·논문 600~1000.",
    tip: "에이전트용은 조금 작게 잡아야 툴 호출별 문맥이 깔끔합니다.",
  },
  "tool_rag_retrieve.chunk_overlap": {
    what: "이웃 청크가 겹치는 길이.",
    when: "경계에 걸린 정보가 잘리는 걸 방지. size의 10~15%가 기본.",
  },
  // --- Tool: read_demo_doc ---
  "tool_read_demo_doc.max_chars": {
    what: "한 번 읽을 때 반환할 최대 문자 수.",
    when: "에이전트가 너무 긴 문서를 받으면 컨텍스트가 터집니다. 요약·발췌용이면 1000~3000 권장.",
  },
  // --- Tool: current_time ---
  "tool_current_time.timezone": {
    what: "IANA 시간대 이름 (예: Asia/Seoul, UTC, America/New_York).",
    when: "국제화된 앱에서는 UTC 권장. 학습·데모에서는 Asia/Seoul.",
  },
  "tool_current_time.format": {
    what: "strftime 포맷 문자열.",
    when: "%Y-%m-%d %H:%M:%S (기본), %Y년 %m월 %d일 (한국어), %H:%M (시간만) 등.",
    tip: "에이전트는 반환된 문자열을 그대로 LLM에 넣으므로 사람이 읽기 좋은 포맷이면 OK.",
  },
  // --- Tool: regex_extract ---
  "tool_regex_extract.pattern_preset": {
    what: "추출할 패턴 종류.",
    when: "email(이메일), phone_kr(010-xxxx-xxxx), url, date(YYYY-MM-DD), hashtag(#태그), number(숫자)",
    tip: "여러 종류를 뽑아야 하면 이 툴을 여러 번 추가하세요.",
  },
  // --- Tool: unit_convert ---
  "tool_unit_convert.category": {
    what: "변환 카테고리. length / mass / temperature 중 하나.",
    when: "한 카테고리 안에서만 변환됩니다. 다른 카테고리가 필요하면 별도 툴 노드를 추가.",
    tip: "length: m/cm/mm/km/mi/ft/in, mass: kg/g/mg/lb/oz, temperature: C/F/K",
  },
  // --- Tool: translate_text ---
  "tool_translate_text.target_lang": {
    what: "번역 대상 언어 코드.",
    when: "en(영어), ko(한국어), ja(일본어), zh(중국어), es(스페인어), fr(프랑스어).",
    tip: "원문 언어는 LLM이 자동 감지합니다.",
  },
  // --- Tool: summarize_doc ---
  "tool_summarize_doc.source": {
    what: "요약할 데모 문서. demo:<파일명>.",
    when: "이 툴은 호출 시 지정된 문서 전체를 읽어 요약합니다.",
  },
  "tool_summarize_doc.style": {
    what: "요약 스타일.",
    when: "bullets: 3~5 불릿, one_line: 한 문장, formal: 섹션 헤딩 포함 구조적 요약.",
    tip: "강의 슬라이드용은 bullets, SNS 공유용은 one_line이 적합.",
  },
};

export function ParamHelp({ nodeType, paramName }: { nodeType: string; paramName: string }) {
  const key = `${nodeType}.${paramName}`;
  const entry = PARAM_HELP[key];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom"; arrowLeft: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  function computePosition() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const bubbleW = 280;
    const bubbleH_est = 150;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const iconCenterX = rect.left + rect.width / 2;

    // Try to position ABOVE the icon, horizontally centered.
    let top = rect.top - bubbleH_est - 12;
    let placement: "top" | "bottom" = "top";
    if (top < 10) {
      top = rect.bottom + 12;
      placement = "bottom";
    }
    let left = iconCenterX - bubbleW / 2;
    left = Math.max(10, Math.min(left, winW - bubbleW - 10));
    const arrowLeft = Math.max(12, Math.min(bubbleW - 20, iconCenterX - left));
    top = Math.max(10, Math.min(top, winH - 40));
    setPos({ top, left, placement, arrowLeft });
  }

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onUpdate = () => computePosition();
    window.addEventListener("resize", onUpdate);
    window.addEventListener("scroll", onUpdate, true);
    return () => {
      window.removeEventListener("resize", onUpdate);
      window.removeEventListener("scroll", onUpdate, true);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="nodrag"
        onMouseEnter={() => { setOpen(true); requestAnimationFrame(computePosition); }}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); requestAnimationFrame(computePosition); }}
        aria-label={`${paramName} 설명`}
        style={{
          background: "transparent",
          color: "var(--accent-dark)",
          border: "1.5px solid var(--accent-dark)",
          width: 16, height: 16, borderRadius: 8,
          padding: 0, fontSize: 10, fontWeight: 800,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "help", lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && pos && mounted && createPortal(
        <div
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: 280,
            zIndex: 10000,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              background: "var(--panel)",
              border: "1.5px solid var(--accent-dark)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text)",
              lineHeight: 1.55,
              boxShadow: "0 6px 20px rgba(30, 42, 36, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--accent-dark)", marginBottom: 4 }}>
              {paramName}
            </div>
            <div style={{ marginBottom: entry.when ? 6 : 0 }}>
              <strong>뭐예요?</strong> {entry.what}
            </div>
            {entry.when && (
              <div style={{ marginBottom: entry.tip ? 6 : 0 }}>
                <strong>언제 쓰나요?</strong> {entry.when}
              </div>
            )}
            {entry.tip && (
              <div style={{ color: "var(--accent-dark)" }}>
                💡 <em>{entry.tip}</em>
              </div>
            )}
            {/* Arrow pointing at the "?" icon */}
            <span
              style={{
                position: "absolute",
                left: pos.arrowLeft - 7,
                ...(pos.placement === "top"
                  ? { bottom: -8 }
                  : { top: -8 }),
                width: 14,
                height: 14,
                background: "var(--panel)",
                borderRight: "1.5px solid var(--accent-dark)",
                borderBottom: "1.5px solid var(--accent-dark)",
                transform: pos.placement === "top" ? "rotate(45deg)" : "rotate(225deg)",
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
