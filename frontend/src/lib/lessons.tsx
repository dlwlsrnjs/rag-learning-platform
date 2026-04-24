import type { ReactNode } from "react";
import type { ChunkConfig, PipelineSpec } from "@/lib/api";
import type { CodingTask, LineHint } from "@/components/tutorial/CodingExercise";

export type StepRender =
  | { kind: "explain" }
  | { kind: "doc-picker" }
  | { kind: "news-search" }
  | { kind: "chunk-compare"; source?: string; configs: ChunkConfig[] }
  | { kind: "run-pipeline"; spec: PipelineSpec }
  | { kind: "trace-view" }
  | { kind: "generate-code"; spec: PipelineSpec }
  | { kind: "external-link"; href: string; label: string }
  | {
      kind: "coding";
      starterCode: string;
      tasks: CodingTask[];
      lineHints: LineHint[];
      intro?: ReactNode;
      storageKey?: string;
    };

export type Step = {
  title: string;
  explanation: ReactNode;
  render: StepRender;
};

export type Lesson = {
  id: string;
  title: string;
  summary: string;
  duration: string;
  level: "beginner" | "intermediate";
  topics: string[];
  steps: Step[];
};

/** Build a default pipeline spec around a chosen document source. */
const specFor = (source: string, query: string, topK = 3): PipelineSpec => ({
  id: "lesson",
  name: "Lesson Pipeline",
  query,
  nodes: [
    { id: "load1", type: "loader", params: { source } },
    { id: "chunk1", type: "chunker", params: { strategy: "recursive", chunk_size: 400, chunk_overlap: 40 } },
    { id: "embed1", type: "embedder", params: { provider: "openai", model: "text-embedding-3-small" } },
    { id: "retrieve1", type: "retriever", params: { top_k: topK, provider: "openai", model: "text-embedding-3-small" } },
    { id: "gen1", type: "generator", params: { provider: "openai", model: "gpt-4o-mini", temperature: 0.2 } },
  ],
  edges: [
    { from: "load1", to: "chunk1" },
    { from: "chunk1", to: "embed1" },
    { from: "embed1", to: "retrieve1" },
    { from: "retrieve1", to: "gen1" },
  ],
});

const P = ({ children }: { children: ReactNode }) => (
  <p style={{ margin: "0 0 8px" }}>{children}</p>
);
const H = ({ children }: { children: ReactNode }) => (
  <h4 style={{ margin: "10px 0 6px" }}>{children}</h4>
);
const Li = ({ children }: { children: ReactNode }) => (
  <li style={{ marginBottom: 4 }}>{children}</li>
);
const C = ({ children }: { children: ReactNode }) => <code>{children}</code>;

const CODING_STARTER = `# SKKU RAG Lab — 한 파일로 돌아가는 작은 RAG
# 실행: OPENAI_API_KEY 환경변수 설정 후 python 이_파일.py
import os
import numpy as np
from openai import OpenAI

# 1) OpenAI 클라이언트 준비
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# 2) 실습 문서 로드 — 어느 파일을 쓸지 경로를 채우세요
with open("demo_docs/___FILENAME___", encoding="utf-8") as f:
    text = f.read()

# 3) 고정 길이 청킹 — 다음 인덱스를 어떻게 옮겨야 overlap이 반영될까요?
def chunk_text(t, size, overlap):
    out, i = [], 0
    while i < len(t):
        out.append(t[i : i + size])
        i += ___OVERLAP_STEP___
    return out

CHUNK_SIZE = ___CHUNK_SIZE___    # 300~800 사이에서 한 숫자
CHUNK_OVERLAP = 40
chunks = chunk_text(text, CHUNK_SIZE, CHUNK_OVERLAP)

# 4) 각 청크를 벡터로 변환 (임베딩)
EMBED_MODEL = "___EMBED_MODEL___"    # 예: text-embedding-3-small
emb = client.embeddings.create(model=EMBED_MODEL, input=chunks)
vectors = np.array([d.embedding for d in emb.data], dtype=np.float32)

# 5) 질문 임베딩 + 코사인 유사도로 top-k 검색
QUERY = "___QUERY___"    # 문서에 답이 있을 법한 한국어 질문
TOP_K = 3

q = client.embeddings.create(model=EMBED_MODEL, input=[QUERY])
q_vec = np.array(q.data[0].embedding, dtype=np.float32)

mat = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12)
qn = q_vec / (np.linalg.norm(q_vec) + 1e-12)
sims = mat @ qn
top_idx = np.argsort(sims)[-TOP_K:][::-1]
retrieved = [chunks[i] for i in top_idx]

# 6) LLM에 컨텍스트와 함께 질문 — 어느 모델을 쓰시겠어요?
context = "\\n\\n".join(f"[{i+1}] {c}" for i, c in enumerate(retrieved))
resp = client.chat.completions.create(
    model="___LLM_MODEL___",    # 예: gpt-4o-mini
    temperature=0.2,
    messages=[
        {"role": "system", "content": "주어진 컨텍스트만 근거로 간결히 답하세요."},
        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {QUERY}"},
    ],
)
print(resp.choices[0].message.content)
`;

const CODING_TASKS: CodingTask[] = [
  {
    id: "filename",
    label: "실습할 뉴스 파일 이름을 지정하세요",
    pattern: /open\s*\(\s*["']demo_docs\/[A-Za-z0-9_\-]+\.md["']/,
    hint: "open(\"demo_docs/news_ai_ethics_kr.md\") 처럼 확장자까지 쓰세요. 사용 가능: news_ai_ethics_kr.md, news_climate_kr.md, news_space_kr.md, news_kpop_kr.md, news_economy_kr.md",
  },
  {
    id: "overlap_step",
    label: "청킹 함수에서 다음 인덱스를 어떻게 옮길지 채우세요",
    pattern: /i\s*\+=\s*size\s*-\s*overlap\b/,
    hint: "i += size - overlap. size만큼 앞으로 가면 겹치지 않고, overlap만큼 뒤로 당기면 경계가 겹칩니다.",
  },
  {
    id: "chunk_size",
    label: "CHUNK_SIZE에 적절한 숫자를 넣으세요",
    pattern: /CHUNK_SIZE\s*=\s*([3-9]\d{2}|1[0-9]\d{2}|2000)\b/,
    hint: "300~800 권장. 예: CHUNK_SIZE = 400. 너무 작으면 문맥이 부족, 너무 크면 검색 점수가 희석됩니다.",
  },
  {
    id: "embed_model",
    label: "임베딩 모델 이름을 문자열로 지정하세요",
    pattern: /EMBED_MODEL\s*=\s*["']text-embedding-3-(small|large)["']/,
    hint: "EMBED_MODEL = \"text-embedding-3-small\" 또는 \"text-embedding-3-large\". small이 저렴·빠릅니다.",
  },
  {
    id: "query",
    label: "문서로 답할 수 있는 질문을 한국어로 작성하세요",
    pattern: /QUERY\s*=\s*["'](?!___)[^"']{6,}["']/,
    hint: "예: QUERY = \"가이드라인의 다섯 가지 원칙은 무엇인가?\" — 고른 문서의 실제 내용을 겨냥한 질문이어야 검색이 의미가 있습니다.",
  },
  {
    id: "llm_model",
    label: "답변 생성용 LLM 모델을 지정하세요",
    pattern: /model\s*=\s*["']gpt-[^"']+["']/,
    hint: "model=\"gpt-4o-mini\" (저렴·빠름) 또는 \"gpt-4o\"(고품질). 학습용이면 mini로 충분합니다.",
  },
];

const CODING_LINE_HINTS: LineHint[] = [
  { line: 1, text: "파일 상단 주석. 이 파일이 무엇이고 어떻게 실행하는지 설명합니다." },
  { line: 2, text: "실행 방법 메모. 환경변수에 API 키를 넣어 두면 코드가 os.environ에서 꺼내 씁니다." },
  { line: 3, text: "표준 라이브러리 os — 환경 변수 접근에 사용합니다." },
  { line: 4, text: "numpy — 임베딩 벡터와 코사인 유사도 계산을 위해 필요한 수치 라이브러리." },
  { line: 5, text: "OpenAI 공식 SDK의 클라이언트 클래스." },
  { line: 7, text: "섹션 주석: OpenAI 클라이언트 초기화." },
  { line: 8, text: "환경 변수 OPENAI_API_KEY에서 키를 읽어 클라이언트 인스턴스를 만듭니다. 키가 없으면 KeyError가 납니다." },
  { line: 10, text: "섹션 주석: 실습 문서를 읽어 오는 단계." },
  { line: 11, text: "demo_docs 폴더 안의 마크다운 파일을 UTF-8로 엽니다. 파일명은 여러분이 채워야 합니다." },
  { line: 12, text: "파일 전체 텍스트를 변수 text로 읽어 들입니다." },
  { line: 14, text: "섹션 주석: 청킹. 문서를 임베딩 가능한 크기로 쪼갭니다." },
  { line: 15, text: "청킹 함수 정의. t는 원문, size는 한 청크 길이, overlap은 겹침 길이." },
  { line: 16, text: "결과 청크 리스트 out과 현재 커서 i를 초기화." },
  { line: 17, text: "문서 끝에 도달할 때까지 반복합니다." },
  { line: 18, text: "현재 위치부터 size 길이만큼 잘라 청크로 추가." },
  { line: 19, text: "다음 시작 위치를 어떻게 옮길지가 핵심. overlap이 클수록 경계가 더 겹칩니다." },
  { line: 20, text: "완성된 청크 리스트를 반환." },
  { line: 22, text: "청크 길이. 300~800자가 한국어 뉴스에 적절한 범위입니다." },
  { line: 23, text: "오버랩 크기. size의 10~15% 정도가 기본값." },
  { line: 24, text: "앞서 정의한 함수로 실제 청킹을 수행합니다." },
  { line: 26, text: "섹션 주석: 임베딩. 텍스트를 의미 벡터로 바꿉니다." },
  { line: 27, text: "사용할 임베딩 모델 이름. 리트리버와 동일해야 벡터 공간이 맞습니다." },
  { line: 28, text: "OpenAI 임베딩 API 호출. 여러 청크를 한 번에 넘겨 벡터를 받습니다." },
  { line: 29, text: "응답에서 벡터만 추출해 numpy 2D 배열로 변환. 행=청크, 열=차원." },
  { line: 31, text: "섹션 주석: 검색 단계. 질문과 가장 가까운 청크를 찾습니다." },
  { line: 32, text: "질문 문자열. 고른 문서에서 답할 수 있는 내용이어야 합니다." },
  { line: 33, text: "상위 몇 개 청크를 가져올지. 3~5가 일반적." },
  { line: 35, text: "질문을 같은 모델로 임베딩. 반드시 같은 모델을 써야 의미가 비교됩니다." },
  { line: 36, text: "질문 벡터 추출. 청크 벡터와 같은 차원의 1D 배열." },
  { line: 38, text: "청크 벡터 행렬을 L2 정규화. 각 행을 단위 벡터로 만듭니다." },
  { line: 39, text: "질문 벡터도 동일하게 정규화." },
  { line: 40, text: "정규화된 벡터들의 내적 = 코사인 유사도. 행렬곱 한 번으로 모든 청크와의 유사도가 나옵니다." },
  { line: 41, text: "유사도가 큰 순서로 정렬한 뒤 상위 TOP_K개의 인덱스만 남깁니다." },
  { line: 42, text: "해당 인덱스의 원본 청크 텍스트를 모읍니다." },
  { line: 44, text: "섹션 주석: 마지막 단계. LLM이 컨텍스트를 읽고 답을 작성합니다." },
  { line: 45, text: "검색된 청크들을 [1], [2]... 번호와 함께 프롬프트용 문자열로 조립." },
  { line: 46, text: "OpenAI Chat Completions API 호출. 여러분이 어느 모델을 쓸지 정합니다." },
  { line: 47, text: "채팅 모델명. gpt-4o-mini는 저렴, gpt-4o는 고품질." },
  { line: 48, text: "temperature=0.2: 답변을 보수적으로(사실 중심으로) 만들기 위해 낮게 설정." },
  { line: 49, text: "system 메시지 — LLM의 역할과 행동 규칙을 지정." },
  { line: 50, text: "역할 구분 규칙: '컨텍스트만' 근거로 답하라고 명시하면 환각이 줄어듭니다." },
  { line: 51, text: "user 메시지 — 컨텍스트와 질문을 한 덩어리로 넘깁니다." },
  { line: 52, text: "실제 프롬프트 템플릿. Context를 먼저, Question을 뒤에 놓는 것이 일반적인 관례." },
  { line: 55, text: "응답에서 첫 번째 선택지의 메시지 내용을 출력. 이것이 LLM의 최종 답변입니다." },
];

export const LESSONS: Lesson[] = [
  {
    id: "rag-overview",
    title: "1. RAG 전체 흐름 둘러보기",
    summary: "문서 하나를 골라 5단계 파이프라인을 끝까지 돌려 보고, 각 단계의 입·출이 어떻게 변하는지 트레이스로 관찰합니다.",
    duration: "약 15분",
    level: "beginner",
    topics: ["RAG 개념", "5단계 파이프라인", "트레이스 읽기"],
    steps: [
      {
        title: "RAG이란 무엇인가요?",
        explanation: (
          <>
            <P>
              <strong>RAG</strong>(Retrieval-Augmented Generation)은 대형 언어 모델(LLM)에
              외부 지식을 꺼내 붙여 주는 기법입니다. 모델이 학습 시점에 몰랐던 정보나,
              사내 문서처럼 공개되지 않은 지식을 답변에 반영할 수 있게 해 줍니다.
            </P>
            <P>왜 필요할까요?</P>
            <ul>
              <Li><strong>환각(hallucination) 감소</strong> — 근거 문서를 함께 제공하면 답변이 구체 사실에 밀착됩니다.</Li>
              <Li><strong>최신성</strong> — 학습 컷오프 이후의 내용도 문서를 바꾸기만 하면 반영됩니다.</Li>
              <Li><strong>소스 가시성</strong> — 어느 문서·청크가 답의 근거였는지 보여줄 수 있습니다.</Li>
            </ul>
            <P className="muted">
              이 튜토리얼에서는 뉴스 기사 하나를 골라 전체 파이프라인을 돌려 보고,
              각 단계가 입력을 어떻게 변형하는지 직접 확인합니다.
            </P>
          </>
        ),
        render: { kind: "explain" },
      },
      {
        title: "실습할 문서 고르기",
        explanation: (
          <>
            <P>
              번들된 뉴스 5편 또는 기존 기술 문서 2편 중 하나를 골라 주세요. 아래에서 한 번 클릭하면
              다음 단계의 파이프라인이 이 문서를 사용합니다.
            </P>
            <P className="muted">
              팁: 처음에는 <C>news_ai_ethics_kr.md</C>처럼 주제가 명확한 기사를 추천합니다.
              문맥이 길고 사실 밀도가 높은 글이 RAG 효과를 체감하기 좋습니다.
            </P>
          </>
        ),
        render: { kind: "doc-picker" },
      },
      {
        title: "5단계 파이프라인",
        explanation: (
          <>
            <P>RAG 파이프라인은 다섯 단계로 요약할 수 있습니다.</P>
            <ol>
              <Li><strong>Load</strong> — 원문을 텍스트로 읽어 들입니다.</Li>
              <Li><strong>Chunk</strong> — 임베딩 가능한 크기로 쪼갭니다. 크기·오버랩이 품질에 크게 영향.</Li>
              <Li><strong>Embed</strong> — 각 청크를 의미 벡터로 변환합니다.</Li>
              <Li><strong>Retrieve</strong> — 쿼리 벡터와 가장 가까운 상위 K개 청크를 찾습니다.</Li>
              <Li><strong>Generate</strong> — 쿼리 + 검색된 청크를 프롬프트에 넣어 LLM이 답을 씁니다.</Li>
            </ol>
            <P className="muted">
              아래 "Run Pipeline"을 누르면 방금 고른 문서로 이 다섯 단계를 차례대로 실행합니다.
              OpenAI 키가 없어도 임베딩은 해시 폴백, 생성은 stub으로 흐름 자체는 확인할 수 있습니다.
            </P>
          </>
        ),
        render: { kind: "run-pipeline", spec: specFor("demo:news_ai_ethics_kr.md", "가이드라인의 다섯 가지 원칙은 무엇인가?") },
      },
      {
        title: "트레이스 해석하기",
        explanation: (
          <>
            <P>
              각 노드 카드의 <C>inputs / outputs</C>를 펼쳐 보세요. 문서가 어떻게 청크 개수로 바뀌고,
              그게 임베딩 개수가 되고, 마지막에 K개 청크만 남는지 한눈에 보입니다.
            </P>
            <P>자주 보게 되는 수치들:</P>
            <ul>
              <Li><strong>chunks</strong> — 몇 개로 쪼갰는가.</Li>
              <Li><strong>retrieved[].preview</strong> — 실제 답변 근거로 들어간 청크.</Li>
              <Li><strong>duration_ms</strong> — 단계별 소요. 보통 embed/generate가 대부분을 차지합니다.</Li>
            </ul>
          </>
        ),
        render: { kind: "trace-view" },
      },
      {
        title: "정리",
        explanation: (
          <>
            <P>여기서 기억해 가실 세 가지:</P>
            <ul>
              <Li>RAG은 "<strong>검색 → 주입 → 생성</strong>" 한 사이클입니다.</Li>
              <Li>각 단계는 <strong>독립적으로 튜닝</strong>할 수 있습니다. 청킹만 바꿔도 답 품질이 크게 달라집니다.</Li>
              <Li>트레이스를 습관적으로 읽는 것이 디버깅의 시작입니다.</Li>
            </ul>
            <P className="muted">다음 렛슨에서는 청킹을 깊이 들여다봅니다.</P>
          </>
        ),
        render: { kind: "explain" },
      },
    ],
  },

  {
    id: "chunking",
    title: "2. 청킹 실험실",
    summary: "같은 뉴스 기사에 청크 크기, 오버랩, 전략을 달리 줘서 결과가 어떻게 바뀌는지 직접 비교합니다.",
    duration: "약 15분",
    level: "beginner",
    topics: ["청크 크기", "오버랩", "fixed vs recursive"],
    steps: [
      {
        title: "왜 청킹이 중요한가요?",
        explanation: (
          <>
            <P>
              청킹은 "문서를 어떤 단위로 쪼개 넣을 것인가"를 결정합니다. 이 결정 하나가
              리트리버의 정확도와 최종 답변 품질을 크게 좌우합니다.
            </P>
            <ul>
              <Li><strong>너무 작으면</strong> — 검색 점수는 뾰족해지지만 청크에 문맥이 부족해 답이 빈약해집니다.</Li>
              <Li><strong>너무 크면</strong> — 문맥은 풍부하지만 관련 없는 내용이 섞여 유사도 점수가 희석됩니다.</Li>
              <Li><strong>오버랩</strong> — 경계에 걸친 정보가 잘려 나가는 걸 막습니다.</Li>
            </ul>
            <P className="muted">권장 시작점: 300~800자, 오버랩은 10~20%.</P>
          </>
        ),
        render: { kind: "explain" },
      },
      {
        title: "작은 청크 vs 큰 청크",
        explanation: (
          <>
            <P>
              같은 기사를 <C>chunk_size=200</C>과 <C>chunk_size=800</C>으로 나눠 봅니다.
              청크 수, 평균 길이, 미리보기의 차이를 확인하세요.
            </P>
          </>
        ),
        render: {
          kind: "chunk-compare",
          source: "demo:news_climate_kr.md",
          configs: [
            { label: "small (200)", strategy: "recursive", chunk_size: 200, chunk_overlap: 20 },
            { label: "large (800)", strategy: "recursive", chunk_size: 800, chunk_overlap: 80 },
          ],
        },
      },
      {
        title: "오버랩의 역할",
        explanation: (
          <>
            <P>
              오버랩이 0이면 청크 경계에서 정보가 잘릴 수 있습니다. 아래에서 <C>overlap=0</C>과
              <C>overlap=60</C>을 비교하고, 각 청크의 시작·끝 문장이 어떻게 달라지는지 보세요.
            </P>
          </>
        ),
        render: {
          kind: "chunk-compare",
          source: "demo:news_climate_kr.md",
          configs: [
            { label: "no overlap", strategy: "recursive", chunk_size: 400, chunk_overlap: 0 },
            { label: "overlap 60", strategy: "recursive", chunk_size: 400, chunk_overlap: 60 },
          ],
        },
      },
      {
        title: "fixed vs recursive",
        explanation: (
          <>
            <P>
              <strong>fixed</strong>는 무조건 고정 길이로 자릅니다. <strong>recursive</strong>는
              문단/문장 경계를 우선 존중하면서 크기 제한을 맞춥니다. 같은 size를 줘도 경계 품질이
              다릅니다.
            </P>
          </>
        ),
        render: {
          kind: "chunk-compare",
          source: "demo:news_ai_ethics_kr.md",
          configs: [
            { label: "fixed 400", strategy: "fixed", chunk_size: 400, chunk_overlap: 40 },
            { label: "recursive 400", strategy: "recursive", chunk_size: 400, chunk_overlap: 40 },
          ],
        },
      },
      {
        title: "정리: 어떤 기본값으로 시작할까",
        explanation: (
          <>
            <P>실무에서 첫 설정으로 쓸 만한 값:</P>
            <ul>
              <Li>strategy: <C>recursive</C></Li>
              <Li>chunk_size: <C>400~600</C> (한국어는 영어보다 조금 짧게)</Li>
              <Li>chunk_overlap: size의 <C>10~15%</C></Li>
            </ul>
            <P>그 다음은 작은 평가 질문셋을 만들어 정량 비교하세요. 직관보다 숫자가 믿을 만합니다.</P>
          </>
        ),
        render: { kind: "explain" },
      },
    ],
  },

  {
    id: "flow-builder",
    title: "3. GUI 파이프라인 빌더 체험",
    summary: "Flow Editor로 이동해 노드를 드래그·연결해 파이프라인을 구성하고, 같은 그래프를 Python 코드로 뽑아 봅니다.",
    duration: "약 10분",
    level: "beginner",
    topics: ["React Flow", "노드·엣지", "결정론적 코드 생성"],
    steps: [
      {
        title: "GUI로 만든다는 것의 의미",
        explanation: (
          <>
            <P>
              Flow Editor에서 만지는 그래프는 내부적으로 하나의 JSON 스펙입니다.
              스펙은 실행 엔진·코드 생성기·트레이서의 공통 입력이므로, 어떤 방식으로 만들든
              결과가 일치합니다.
            </P>
            <P>즉, <strong>드래그로 그리는 행위 = 스펙을 편집하는 행위</strong>입니다.</P>
          </>
        ),
        render: { kind: "explain" },
      },
      {
        title: "각 노드가 하는 일",
        explanation: (
          <>
            <H>Loader</H>
            <P><C>source</C>로 <C>demo:파일명</C> 또는 <C>text:내용</C>을 지정합니다.</P>
            <H>Chunker</H>
            <P><C>strategy</C>, <C>chunk_size</C>, <C>chunk_overlap</C>. 렛슨 2에서 다룬 트레이드오프.</P>
            <H>Embedder / Retriever</H>
            <P><C>provider=openai</C>(키 필요) 또는 <C>hash</C>(오프라인). 둘이 같은 provider여야 의미 있는 검색이 됩니다.</P>
            <H>Generator</H>
            <P><C>provider=openai</C>면 답변을 LLM이 작성, <C>stub</C>이면 검색된 청크를 그대로 보여줍니다.</P>
          </>
        ),
        render: { kind: "explain" },
      },
      {
        title: "직접 해보기",
        explanation: (
          <>
            <P>아래 버튼을 눌러 Flow Editor로 이동한 뒤:</P>
            <ol>
              <Li>Chunker 노드의 <C>chunk_size</C>를 300 → 700으로 바꿔 보세요.</Li>
              <Li><strong>Run Pipeline</strong>을 눌러 트레이스의 chunks 수가 달라지는지 확인.</Li>
              <Li><strong>Generate Python</strong>을 눌러 나온 코드에 새 값이 박혀 있는지 확인.</Li>
            </ol>
          </>
        ),
        render: { kind: "external-link", href: "/editor/flow", label: "Flow Editor 열기 →" },
      },
      {
        title: "스펙 → 코드 결정론성",
        explanation: (
          <>
            <P>
              같은 그래프는 항상 같은 Python을 만들어 냅니다. 아래는 현재 기본 스펙으로부터 생성한
              코드입니다. 이 코드는 사이트 없이도 그대로 돌려 볼 수 있습니다.
            </P>
            <P className="muted">
              (다음 렛슨에서 "자연어 → 코드" 방식과 비교합니다. 자유도는 높지만 재현성이 낮아요.)
            </P>
          </>
        ),
        render: { kind: "generate-code", spec: specFor("demo:news_economy_kr.md", "한은 금리 결정의 핵심 근거는?") },
      },
    ],
  },

  {
    id: "hands-on-code",
    title: "4. 직접 코드로 RAG 완성하기",
    summary: "Python 빈칸 6개를 채우며 load→chunk→embed→retrieve→generate 전체를 손으로 구현합니다. 각 줄에 마우스를 올리면 의미 설명, 빈칸을 채우면 실시간으로 ✓ 체크됩니다.",
    duration: "약 20분",
    level: "intermediate",
    topics: ["Python 실습", "실시간 코칭", "체크리스트"],
    steps: [
      {
        title: "왜 직접 써 봐야 하나요?",
        explanation: (
          <>
            <P>
              GUI로 조립하는 것과 코드로 한 줄씩 쓰는 것은 학습 효과가 다릅니다.
              코드를 직접 써 보면 "<strong>임베딩 결과가 numpy 배열이구나</strong>",
              "<strong>cosine은 결국 정규화된 벡터의 내적이구나</strong>" 같은 체감이
              생깁니다. 이 렛슨에서는 빈칸을 하나씩 채우면서 전체 파이프라인을 완성합니다.
            </P>
            <P>진행 방식:</P>
            <ul>
              <Li><strong>참고 코드</strong> 줄에 마우스를 올리면 그 줄이 하는 일이 툴팁으로 나타납니다.</Li>
              <Li>오른쪽 <strong>체크리스트</strong>의 과제를 하나씩 해결하면 자동으로 ✓ 표시됩니다.</Li>
              <Li>막히면 각 과제의 <strong>힌트</strong> 버튼을 누르세요.</Li>
              <Li>여러분이 친 코드는 브라우저에 자동 저장됩니다.</Li>
            </ul>
          </>
        ),
        render: { kind: "explain" },
      },
      {
        title: "빈칸 채우며 완성하기",
        explanation: (
          <>
            <P>
              아래 코드는 데모 문서 <C>demo_docs/news_ai_ethics_kr.md</C>로 RAG을 돌리는
              실행 가능한 스크립트의 뼈대입니다. <strong>노란색 빈칸 6개</strong>를 채우면
              완성됩니다. 체크리스트가 모두 ✓ 되면 실제로 <C>python 파일명.py</C>로 돌려
              답변을 받을 수 있는 코드가 됩니다.
            </P>
          </>
        ),
        render: {
          kind: "coding",
          storageKey: "skku-rag:lesson4-code",
          intro: null,
          starterCode: CODING_STARTER,
          tasks: CODING_TASKS,
          lineHints: CODING_LINE_HINTS,
        },
      },
      {
        title: "정리",
        explanation: (
          <>
            <P>기억해 가실 것:</P>
            <ul>
              <Li>RAG은 복잡한 마법이 아니라 <strong>numpy 몇 줄 + OpenAI 호출 두 번</strong>으로 구성된 흐름입니다.</Li>
              <Li>임베더와 리트리버는 <strong>같은 모델</strong>을 써야 합니다. 다르면 벡터 공간이 달라 검색이 의미 없어집니다.</Li>
              <Li>청크 크기와 top-k는 <strong>데이터와 질문 성격</strong>에 따라 달라집니다. 위 숫자는 기본값일 뿐, 평가셋으로 튜닝해 보세요.</Li>
            </ul>
            <P>
              이제 <a href="/editor/flow">Flow Editor</a>로 돌아가 같은 파이프라인을
              GUI로 조립해 보세요. 방금 직접 쓴 코드가 그래프의 어느 노드에 대응되는지
              한눈에 보일 겁니다.
            </P>
          </>
        ),
        render: { kind: "explain" },
      },
    ],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
