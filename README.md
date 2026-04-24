# RAG Learning Site

RAG(검색 증강 생성)을 **시각화·실험·학습**할 수 있는 웹사이트.

## 지금 되는 것

- **Flow Editor** (`/editor/flow`) — React Flow 기반 드래그 파이프라인 편집 + 실행 + 결정론적 Python 코드 생성
- **JSON Editor** (`/editor`) — 스펙을 직접 JSON으로 편집 (power users)
- **Chunking Lab** (`/lab/chunking`) — 같은 문서에 여러 청킹 설정을 돌려 결과를 나란히 비교
- **NL → Code** (`/codegen/freeform`) — 자연어 프롬프트로 GPT가 한 파일짜리 RAG 코드 작성
- 단계별 트레이스: 각 노드의 입/출 요약, 파라미터, 소요 시간, 로그
- BYOK (localStorage): 키는 브라우저에만, 백엔드로는 요청마다 전송. 키 없어도 해시 임베딩 + 스텁 답변으로 배선 검증 가능

## 설계 한 줄 요약

**모든 기능은 같은 파이프라인 스펙(JSON)을 공유합니다.**

- GUI 노드 에디터 → 스펙 편집 UI (예정)
- 실행 엔진 → 스펙을 읽어 RAG 실행 + 단계별 트레이스 반환
- 코드 생성기 → 스펙을 독립 실행 가능한 Python 코드로 렌더
- "GPT가 직접 코드 쓰는 버전" → 스펙 대신 자연어 → 코드 (예정)

이 한 축에 1·3·6번 요구사항이 모두 엮입니다.

## 디렉토리 구조

```
rag_site/
├── backend/                      # FastAPI + 실행 엔진
│   └── app/
│       ├── main.py               # FastAPI 진입점 + /node-types 파라미터 스키마
│       ├── api/                  # /pipelines, /documents 라우트
│       ├── core/
│       │   ├── spec.py           # 파이프라인 스펙 (Pydantic)
│       │   ├── executor.py       # 토폴로지 정렬 + 단계별 실행
│       │   ├── tracer.py         # 단계별 이벤트 기록 (입/출/로그/시간)
│       │   └── codegen.py        # 스펙 → Python 코드
│       ├── nodes/                # 5종 노드: loader/chunker/embedder/retriever/generator
│       ├── templates/            # Jinja 코드 생성 템플릿
│       └── data/demo_docs/       # 내장 데모 문서
├── frontend/                     # Next.js 15 (app router)
│   └── src/
│       ├── app/page.tsx          # 랜딩
│       ├── app/editor/page.tsx   # JSON 스펙 에디터 + 실행 + 트레이스 뷰
│       └── lib/api.ts            # 백엔드 호출 헬퍼
└── ragflow/                      # 참고용 (infiniflow/ragflow 클론)
```

## 실행 방법

### 1. 백엔드

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate              # Windows
# source .venv/bin/activate         # macOS/Linux
pip install -e .
uvicorn app.main:app --reload --port 8000
```

- 헬스 체크: http://localhost:8000/health
- 노드 파라미터 스키마: http://localhost:8000/node-types

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

열기: http://localhost:3000 → "Pipeline Editor" → 기본 JSON으로 `Run Pipeline`.

### API 키 없이 써보기

OpenAI 키를 비워두면 배선 검증용으로:
- 임베더는 결정적 해시 벡터를 돌려주고 (의미 기반은 아님)
- 생성기는 검색된 청크를 그대로 보여주는 "stub" 답변을 반환합니다.

→ 파이프라인·트레이스·코드 생성 흐름은 전부 확인 가능.

## 다음 단계 (로드맵)

| 상태 | 내용 |
|------|------|
| ✓ | 파이프라인 스펙 + 실행 엔진 + 트레이스 |
| ✓ | React Flow 노드 에디터 |
| ✓ | 청킹 랩 |
| ✓ | 스펙→Python 결정론적 코드 생성 |
| ✓ | NL→Code (GPT가 직접 작성) |
| TODO | 임베딩 모델 선택 가이드 (작은 평가셋 + 점수) |
| TODO | LangGraph 툴 탐색기 |
| TODO | 문서 전처리 노하우 학습 테스트 |
| TODO | 사용자 문서 업로드 (현재는 데모 고정) |

## 핵심 스펙 예시

```json
{
  "id": "demo",
  "name": "Basic RAG",
  "query": "What are the five stages of a RAG pipeline?",
  "nodes": [
    {"id": "load1",     "type": "loader",    "params": {"source": "demo:rag_explained.md"}},
    {"id": "chunk1",    "type": "chunker",   "params": {"strategy": "recursive", "chunk_size": 400, "chunk_overlap": 40}},
    {"id": "embed1",    "type": "embedder",  "params": {"provider": "openai", "model": "text-embedding-3-small"}},
    {"id": "retrieve1", "type": "retriever", "params": {"top_k": 3}},
    {"id": "gen1",      "type": "generator", "params": {"provider": "openai", "model": "gpt-4o-mini", "temperature": 0.2}}
  ],
  "edges": [
    {"from": "load1",     "to": "chunk1"},
    {"from": "chunk1",    "to": "embed1"},
    {"from": "embed1",    "to": "retrieve1"},
    {"from": "retrieve1", "to": "gen1"}
  ]
}
```

이 JSON 하나로 (1) 실행, (2) 단계별 트레이스, (3) 독립 Python 파일 생성이 모두 됩니다.
