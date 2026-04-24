import json
from pathlib import Path
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.spec import PipelineSpec
from ..core.stream import ndjson_response

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/optimize", tags=["optimize"])


class OptimizeRequest(BaseModel):
    spec: PipelineSpec
    trace: list[dict[str, Any]]
    answer: str | None = None
    api_key: str


SYSTEM_PROMPT = """당신은 RAG(Retrieval-Augmented Generation) 파이프라인을 리뷰하는 전문가입니다.
사용자의 질문·문서·검색 결과·생성 답변을 보고 현재 파이프라인이 잘 돌아갔는지 평가하고,
필요한 경우 구체적인 파라미터 조정을 JSON 구조로 제안합니다.

반드시 아래 JSON 스키마로만 응답하세요(다른 텍스트·마크다운 펜스 금지):

{
  "review_markdown": "한국어 마크다운 리뷰. 다음 섹션 순서로 작성:\\n## 평가\\n- 질문이 문서로 답할 수 있는가\\n- 검색이 올바른 청크를 가져왔는가\\n- 답변 품질\\n\\n## 결론\\n**최적화 불필요** 또는 **최적화 필요** 중 하나를 굵게 명시하고 한 문장 이유.\\n\\n## 추천 조치 (필요한 경우)\\n- `파라미터명`: `현재값` → `제안값` — 이유",
  "no_change_needed": true,
  "patches": [
    {
      "node_id": "실제 스펙에 존재하는 노드 ID (예: chunk1, retrieve1)",
      "param": "chunk_size | chunk_overlap | strategy | top_k | temperature | model 등",
      "from": "현재 값 (숫자면 숫자, 문자열이면 문자열)",
      "to": "제안 값 (동일 타입)",
      "reason": "왜 이렇게 바꿔야 하는지 한 줄"
    }
  ]
}

엄격 규칙:
- no_change_needed가 true이면 patches는 반드시 빈 배열 [].
- patches에 포함시킨 각 항목은 실제 node_id와 param 이름이 유효해야 함(spec JSON을 참고).
- 정말로 개선 여지가 있을 때만 조정을 제안. 부실한 근거로 억지 제안 금지.
- to 값은 합리적 범위에서: chunk_size 100~2000, chunk_overlap 0~400, top_k 1~20, temperature 0~2.
"""


def _load_excerpt(source: str | None, limit: int = 2500) -> str:
    if not source:
        return "(문서 없음)"
    if source.startswith("demo:"):
        path = DEMO_DIR / source.removeprefix("demo:")
        if not path.exists():
            return f"(demo 파일 없음: {path.name})"
        text = path.read_text(encoding="utf-8")
        return text[:limit] + ("…" if len(text) > limit else "")
    if source.startswith("text:"):
        text = source.removeprefix("text:")
        return text[:limit] + ("…" if len(text) > limit else "")
    return f"(알 수 없는 소스 형식: {source[:40]})"


def _event_by_type(trace: list[dict], node_type: str) -> dict | None:
    for ev in trace:
        if ev.get("node_type") == node_type:
            return ev
    return None


def _build_user_prompt(req: OptimizeRequest) -> str:
    source = None
    for n in req.spec.nodes:
        if n.type == "loader":
            source = n.params.get("source")
            break

    retriever_ev = _event_by_type(req.trace, "retriever")
    retrieved_items = (retriever_ev or {}).get("outputs_summary", {}).get("retrieved", []) or []
    chunker_ev = _event_by_type(req.trace, "chunker")
    total_chunks = (chunker_ev or {}).get("outputs_summary", {}).get("chunks", "?")

    doc_excerpt = _load_excerpt(source)

    # Compact spec for the model (node_id + type + params).
    compact_spec = {
        "nodes": [
            {"id": n.id, "type": n.type, "params": n.params}
            for n in req.spec.nodes
        ],
        "query": req.spec.query,
    }

    lines: list[str] = []
    lines.append(f"### 질문\n{req.spec.query or '(없음)'}\n")
    lines.append(f"### 문서 소스\n{source or '(없음)'}\n")
    lines.append(f"### 문서 발췌 (앞 2500자)\n{doc_excerpt}\n")
    lines.append("### 현재 파이프라인 스펙 (JSON — node_id 참고용)")
    lines.append("```json")
    lines.append(json.dumps(compact_spec, ensure_ascii=False, indent=2))
    lines.append("```")
    lines.append(f"\n### 청킹 결과\n총 청크 수: {total_chunks}\n")
    lines.append(f"### 검색된 상위 청크 ({len(retrieved_items)}개)")
    for i, r in enumerate(retrieved_items[:6]):
        preview = (r.get("preview") or "")[:300]
        lines.append(f"{i+1}. {preview}")
    lines.append(f"\n### 생성된 답변\n{req.answer or '(없음)'}")
    return "\n".join(lines)


@router.post("/suggest")
def suggest(req: OptimizeRequest) -> dict:
    if not req.api_key:
        raise HTTPException(400, "api_key required")

    user_prompt = _build_user_prompt(req)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=req.api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        raise HTTPException(502, f"OpenAI call failed: {type(e).__name__}: {e}")

    raw = (resp.choices[0].message.content or "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Fall back to raw text in review, empty patches.
        parsed = {"review_markdown": raw, "no_change_needed": False, "patches": []}

    review = parsed.get("review_markdown") or ""
    no_change = bool(parsed.get("no_change_needed", False))
    raw_patches = parsed.get("patches") or []

    # Validate patches against the actual spec.
    valid_nodes = {n.id: n for n in req.spec.nodes}
    clean_patches = []
    for p in raw_patches:
        if not isinstance(p, dict):
            continue
        nid = p.get("node_id")
        param = p.get("param")
        if nid not in valid_nodes or not param:
            continue
        clean_patches.append({
            "node_id": nid,
            "node_type": valid_nodes[nid].type,
            "param": param,
            "from": p.get("from"),
            "to": p.get("to"),
            "reason": p.get("reason") or "",
        })

    # If model said no_change but emitted patches, trust the patches.
    if clean_patches:
        no_change = False

    tokens = {
        "prompt": resp.usage.prompt_tokens if resp.usage else None,
        "completion": resp.usage.completion_tokens if resp.usage else None,
    }
    return {
        "review": review,
        "no_change_needed": no_change,
        "patches": clean_patches,
        "model": "gpt-4o-mini",
        "tokens": tokens,
    }


def _stream_suggest(req: OptimizeRequest):
    yield {"type": "start", "title": "GPT-4o-mini 리뷰"}
    if not req.api_key:
        yield {"type": "error", "message": "api_key required"}
        return
    yield {"type": "log", "message": "컨텍스트 구성 중…"}
    user_prompt = _build_user_prompt(req)
    yield {"type": "log", "message": f"프롬프트 {len(user_prompt):,}자 구성됨"}

    yield {"type": "stage_start", "id": "openai_call", "label": "gpt-4o-mini 호출"}
    try:
        from openai import OpenAI
        client = OpenAI(api_key=req.api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        yield {"type": "error", "message": f"OpenAI call failed: {type(e).__name__}: {e}"}
        return
    yield {"type": "stage_end", "id": "openai_call"}

    yield {"type": "log", "message": "JSON 응답 파싱 중…"}
    raw = (resp.choices[0].message.content or "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"review_markdown": raw, "no_change_needed": False, "patches": []}

    review = parsed.get("review_markdown") or ""
    no_change = bool(parsed.get("no_change_needed", False))
    raw_patches = parsed.get("patches") or []
    valid_nodes = {n.id: n for n in req.spec.nodes}
    clean_patches = []
    for p in raw_patches:
        if not isinstance(p, dict):
            continue
        nid = p.get("node_id")
        param = p.get("param")
        if nid not in valid_nodes or not param:
            continue
        clean_patches.append({
            "node_id": nid,
            "node_type": valid_nodes[nid].type,
            "param": param,
            "from": p.get("from"),
            "to": p.get("to"),
            "reason": p.get("reason") or "",
        })
    if clean_patches:
        no_change = False
    yield {"type": "log", "message": f"리뷰 {len(review):,}자 · 제안 {len(clean_patches)}건"}

    yield {
        "type": "done",
        "result": {
            "review": review,
            "no_change_needed": no_change,
            "patches": clean_patches,
            "model": "gpt-4o-mini",
            "tokens": {
                "prompt": resp.usage.prompt_tokens if resp.usage else None,
                "completion": resp.usage.completion_tokens if resp.usage else None,
            },
        },
    }


@router.post("/suggest/stream")
def suggest_stream(req: OptimizeRequest):
    return ndjson_response(lambda: _stream_suggest(req))
