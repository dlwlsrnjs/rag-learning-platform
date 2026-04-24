from __future__ import annotations
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.stream import ndjson_response

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/agent", tags=["agent"])


# ----- Schemas for the Flow Editor -----
AGENT_NODE_TYPES: dict[str, dict] = {
    "agent": {
        "description": "ReAct 에이전트. 사용자 질문을 받아 도구 호출을 스스로 결정합니다.",
        "params": {
            "model": {"type": "string", "default": "gpt-4o-mini"},
            "temperature": {"type": "float", "default": 0.2, "min": 0.0, "max": 2.0},
            "system_prompt": {
                "type": "string",
                "default": "당신은 도구를 활용해 사용자 질문에 정확히 답하는 한국어 조수입니다. 필요할 때만 도구를 부르고, 도구 결과가 있으면 반드시 근거로 삼으세요.",
            },
        },
    },
    # --- Deterministic tools (no OpenAI needed) ---
    "tool_calculator": {
        "description": "파이썬 산술식을 평가해 정확한 숫자를 반환합니다. 수학·환산에 유리.",
        "params": {},
    },
    "tool_current_time": {
        "description": "현재 날짜·시간을 설정한 시간대·포맷으로 반환합니다.",
        "params": {
            "timezone": {"type": "string", "default": "Asia/Seoul"},
            "format": {"type": "string", "default": "%Y-%m-%d %H:%M:%S"},
        },
    },
    "tool_regex_extract": {
        "description": "LLM이 넘긴 텍스트에서 미리 지정한 패턴(email/전화/URL/날짜/해시태그)을 모두 추출.",
        "params": {
            "pattern_preset": {
                "type": "enum",
                "options": ["email", "phone_kr", "url", "date", "hashtag", "number"],
                "default": "email",
            },
        },
    },
    "tool_unit_convert": {
        "description": "단위 변환. LLM이 value·from_unit·to_unit을 넘기면 변환 결과 반환.",
        "params": {
            "category": {
                "type": "enum",
                "options": ["length", "mass", "temperature"],
                "default": "length",
            },
        },
    },
    "tool_word_count": {
        "description": "임의 텍스트의 글자·단어·줄 수를 세어 반환합니다.",
        "params": {},
    },
    # --- RAG / document tools ---
    "tool_rag_retrieve": {
        "description": "지정된 데모 문서에서 관련 청크를 검색해 반환합니다 (해시 임베딩).",
        "params": {
            "source": {"type": "string", "default": "demo:news_ai_ethics_kr.md"},
            "top_k": {"type": "int", "default": 3, "min": 1, "max": 10},
            "chunk_size": {"type": "int", "default": 400, "min": 100, "max": 2000},
            "chunk_overlap": {"type": "int", "default": 40, "min": 0, "max": 400},
        },
    },
    "tool_read_demo_doc": {
        "description": "demo_docs 파일명을 받아 본문을 반환합니다.",
        "params": {
            "max_chars": {"type": "int", "default": 2000, "min": 500, "max": 10000},
        },
    },
    # --- OpenAI-backed tools ---
    "tool_translate_text": {
        "description": "LLM이 넘긴 텍스트를 지정된 언어로 번역합니다 (OpenAI 호출).",
        "params": {
            "target_lang": {
                "type": "enum",
                "options": ["en", "ko", "ja", "zh", "es", "fr"],
                "default": "en",
            },
        },
    },
    "tool_summarize_doc": {
        "description": "지정된 데모 문서를 지정된 스타일로 요약합니다 (OpenAI 호출).",
        "params": {
            "source": {"type": "string", "default": "demo:news_ai_ethics_kr.md"},
            "style": {
                "type": "enum",
                "options": ["bullets", "one_line", "formal"],
                "default": "bullets",
            },
        },
    },
}


@router.get("/node-types")
def node_types() -> dict:
    return AGENT_NODE_TYPES


# ----- Helpers -----
def _load_demo_text(source: str, max_chars: int = 5000) -> str:
    if not source.startswith("demo:"):
        return source[:max_chars]
    path = DEMO_DIR / source.removeprefix("demo:")
    if not path.exists():
        return f"(파일 없음: {path.name})"
    text = path.read_text(encoding="utf-8")
    return text[:max_chars] + ("…" if len(text) > max_chars else "")


REGEX_PRESETS = {
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "phone_kr": r"01[016-9][-\s]?\d{3,4}[-\s]?\d{4}",
    "url": r"https?://[^\s<>\"]+",
    "date": r"\d{4}[-./]\d{1,2}[-./]\d{1,2}",
    "hashtag": r"#[\w가-힣]+",
    "number": r"-?\d+(?:\.\d+)?",
}


# Unit conversion tables.
_LENGTH = {"m": 1.0, "cm": 100.0, "mm": 1000.0, "km": 0.001, "mi": 0.000621371, "ft": 3.28084, "in": 39.3701}
_MASS = {"kg": 1.0, "g": 1000.0, "mg": 1_000_000.0, "lb": 2.20462, "oz": 35.274}


def _convert_unit(category: str, value: float, from_unit: str, to_unit: str) -> str:
    if category == "temperature":
        fu, tu = from_unit.upper(), to_unit.upper()
        to_c = {"C": lambda v: v, "F": lambda v: (v - 32) * 5 / 9, "K": lambda v: v - 273.15}
        from_c = {"C": lambda c: c, "F": lambda c: c * 9 / 5 + 32, "K": lambda c: c + 273.15}
        if fu not in to_c or tu not in from_c:
            return f"지원 단위: C, F, K (입력: {from_unit} → {to_unit})"
        c = to_c[fu](value)
        return f"{value} {fu} = {from_c[tu](c):.4g} {tu}"
    table = _LENGTH if category == "length" else _MASS if category == "mass" else None
    if table is None:
        return f"카테고리 지원 X: {category}"
    if from_unit not in table or to_unit not in table:
        return f"지원 단위: {list(table.keys())} (입력: {from_unit} → {to_unit})"
    base = value / table[from_unit]
    return f"{value} {from_unit} = {base * table[to_unit]:.4g} {to_unit}"


# ----- Tool factories -----
def _make_tool(node_type: str, params: dict[str, Any], api_key: str | None = None):
    from langchain_core.tools import tool
    from ..nodes.chunker import recursive_chunk
    from ..nodes.embedder import _hash_embed

    if node_type == "tool_calculator":
        @tool
        def calculator(expression: str) -> str:
            """파이썬 산술식을 계산해 결과를 문자열로 반환합니다.

            예: "3 * (5 + 2)", "sqrt(16) + 2**3", "round(3.14159, 2)".
            사용 가능한 함수: abs, min, max, round, sqrt, sin, cos, pi, e, log, exp, pow.
            """
            if len(expression) > 300:
                return "식이 너무 깁니다 (300자 제한)."
            safe = {
                "__builtins__": {},
                "abs": abs, "min": min, "max": max, "round": round,
                "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
                "tan": math.tan, "log": math.log, "exp": math.exp,
                "pi": math.pi, "e": math.e, "pow": pow,
            }
            try:
                return str(eval(expression, safe, {}))
            except Exception as ex:
                return f"식 평가 실패: {type(ex).__name__}: {ex}"
        return calculator

    if node_type == "tool_current_time":
        tz_name = str(params.get("timezone", "Asia/Seoul"))
        fmt = str(params.get("format", "%Y-%m-%d %H:%M:%S"))

        @tool
        def current_time() -> str:
            """현재 날짜·시간을 설정된 시간대·포맷으로 반환합니다. 시간 관련 질문에 사용하세요."""
            try:
                from zoneinfo import ZoneInfo
                tz = ZoneInfo(tz_name)
            except Exception:
                tz = None
            now = datetime.now(tz) if tz else datetime.now()
            return now.strftime(fmt) + (f" ({tz_name})" if tz else "")
        return current_time

    if node_type == "tool_regex_extract":
        preset = str(params.get("pattern_preset", "email"))
        pat = REGEX_PRESETS.get(preset, REGEX_PRESETS["email"])

        @tool
        def regex_extract(text: str) -> str:
            """주어진 텍스트에서 미리 지정된 패턴에 해당하는 모든 항목을 추출해 줄바꿈으로 반환합니다."""
            matches = re.findall(pat, text)
            if not matches:
                return f"(패턴 '{preset}' 매칭 없음)"
            unique = list(dict.fromkeys(matches))
            return "\n".join(f"- {m}" for m in unique[:50])
        return regex_extract

    if node_type == "tool_unit_convert":
        category = str(params.get("category", "length"))

        @tool
        def unit_convert(value: float, from_unit: str, to_unit: str) -> str:
            """단위를 변환합니다. value는 숫자, from_unit/to_unit은 단위 문자열.
            지원: length (m, cm, mm, km, mi, ft, in), mass (kg, g, mg, lb, oz), temperature (C, F, K)."""
            try:
                return _convert_unit(category, float(value), from_unit, to_unit)
            except Exception as ex:
                return f"변환 실패: {ex}"
        return unit_convert

    if node_type == "tool_word_count":
        @tool
        def word_count(text: str) -> str:
            """주어진 텍스트의 글자 수·단어 수·줄 수를 반환합니다."""
            chars = len(text)
            words = len(text.split())
            lines = text.count("\n") + 1
            return f"글자 {chars}자 · 단어 {words}개 · 줄 {lines}줄"
        return word_count

    if node_type == "tool_rag_retrieve":
        src = str(params.get("source", "demo:news_ai_ethics_kr.md"))
        top_k = int(params.get("top_k", 3))
        chunk_size = int(params.get("chunk_size", 400))
        chunk_overlap = int(params.get("chunk_overlap", 40))

        @tool
        def rag_retrieve(query: str) -> str:
            """지정된 사내 문서에서 query와 가장 관련 있는 청크 상위 top-k개를 반환합니다.
            사내 정책, 구체 수치, 인용이 필요한 질문에 사용하세요."""
            text = _load_demo_text(src, max_chars=100_000)
            chunks = recursive_chunk(text, chunk_size, chunk_overlap)
            if not chunks:
                return "(문서에서 청크를 만들 수 없습니다)"
            vecs = np.array([_hash_embed(c) for c in chunks], dtype=np.float32)
            qv = np.array(_hash_embed(query), dtype=np.float32)
            v = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12)
            q = qv / (np.linalg.norm(qv) + 1e-12)
            sims = v @ q
            k = min(top_k, len(chunks))
            idx = np.argsort(sims)[-k:][::-1]
            lines = [f"[{rank+1}] (sim={float(sims[int(i)]):.3f}) {chunks[int(i)]}"
                     for rank, i in enumerate(idx)]
            return "\n\n".join(lines)
        return rag_retrieve

    if node_type == "tool_read_demo_doc":
        max_chars = int(params.get("max_chars", 2000))

        @tool
        def read_demo_doc(filename: str) -> str:
            """demo_docs 디렉토리의 텍스트 파일을 읽어 본문을 반환합니다.
            인자는 순수 파일명 (예: 'news_ai_ethics_kr.md'). 확장자까지 포함하세요."""
            return _load_demo_text(f"demo:{filename}", max_chars=max_chars)
        return read_demo_doc

    if node_type == "tool_translate_text":
        target = str(params.get("target_lang", "en"))

        @tool
        def translate_text(text: str) -> str:
            """주어진 텍스트를 지정된 언어로 번역해 결과만 반환합니다. LLM이 원문을 넘기면 번역된 결과가 돌아옵니다."""
            if not api_key:
                return "OPENAI_API_KEY 필요: 이 툴은 OpenAI를 호출합니다."
            try:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    temperature=0,
                    messages=[
                        {"role": "system", "content": f"Translate the given text to language code '{target}'. Return only the translation, no commentary."},
                        {"role": "user", "content": text},
                    ],
                )
                return (resp.choices[0].message.content or "").strip()
            except Exception as ex:
                return f"번역 실패: {type(ex).__name__}: {ex}"
        return translate_text

    if node_type == "tool_summarize_doc":
        src = str(params.get("source", "demo:news_ai_ethics_kr.md"))
        style = str(params.get("style", "bullets"))

        @tool
        def summarize_doc() -> str:
            """지정된 demo_docs 문서를 설정된 스타일(bullets/one_line/formal)로 한국어로 요약합니다."""
            if not api_key:
                return "OPENAI_API_KEY 필요: 이 툴은 OpenAI를 호출합니다."
            text = _load_demo_text(src, max_chars=5000)
            style_prompts = {
                "bullets": "한국어로 핵심만 3~5개의 불릿 포인트로 요약하세요.",
                "one_line": "한국어로 한 문장으로 요약하세요.",
                "formal": "한국어로 ##섹션 헤딩을 포함한 구조적 요약을 작성하세요.",
            }
            try:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    temperature=0.2,
                    messages=[
                        {"role": "system", "content": style_prompts.get(style, style_prompts["bullets"])},
                        {"role": "user", "content": text},
                    ],
                )
                return (resp.choices[0].message.content or "").strip()
            except Exception as ex:
                return f"요약 실패: {type(ex).__name__}: {ex}"
        return summarize_doc

    return None


# ----- Trace extraction -----
def _extract_trace(messages: list) -> list[dict]:
    from langchain_core.messages import AIMessage, ToolMessage, HumanMessage
    trace: list[dict] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            continue
        if isinstance(m, AIMessage):
            if m.tool_calls:
                for tc in m.tool_calls:
                    trace.append({
                        "type": "tool_call",
                        "name": tc.get("name") if isinstance(tc, dict) else tc["name"],
                        "args": (tc.get("args") if isinstance(tc, dict) else tc["args"]) or {},
                    })
            content = m.content if isinstance(m.content, str) else ""
            if content.strip():
                trace.append({"type": "assistant", "content": content})
        elif isinstance(m, ToolMessage):
            content = m.content if isinstance(m.content, str) else str(m.content)
            trace.append({
                "type": "tool_result",
                "name": getattr(m, "name", None) or "(tool)",
                "content": content[:1500] + ("…" if len(content) > 1500 else ""),
            })
    return trace


# ----- Run endpoint -----
class NodeCfg(BaseModel):
    id: str
    type: str
    params: dict[str, Any] = {}


class AgentRunRequest(BaseModel):
    query: str
    nodes: list[NodeCfg]
    api_key: str


@router.post("/run")
def run(req: AgentRunRequest) -> dict:
    if not req.api_key:
        raise HTTPException(400, "api_key required")

    agent_cfg = next((n for n in req.nodes if n.type == "agent"), None)
    if not agent_cfg:
        raise HTTPException(400, "agent node is required")

    model_name = agent_cfg.params.get("model", "gpt-4o-mini")
    temperature = float(agent_cfg.params.get("temperature", 0.2))
    system_prompt = agent_cfg.params.get("system_prompt") or (
        "당신은 도구를 활용해 사용자 질문에 정확히 답하는 한국어 조수입니다."
    )

    tools = []
    tool_nodes_used: list[str] = []
    for n in req.nodes:
        if n.type == "agent":
            continue
        t = _make_tool(n.type, n.params, api_key=req.api_key)
        if t is not None:
            tools.append(t)
            tool_nodes_used.append(n.id)

    try:
        from langchain_openai import ChatOpenAI
        from langgraph.prebuilt import create_react_agent
    except Exception as e:
        raise HTTPException(500, f"langgraph/langchain not available: {e}")

    try:
        llm = ChatOpenAI(model=model_name, temperature=temperature, api_key=req.api_key)
        agent = create_react_agent(llm, tools=tools, prompt=system_prompt)
        result = agent.invoke(
            {"messages": [("user", req.query)]},
            config={"recursion_limit": 15},
        )
    except Exception as e:
        raise HTTPException(502, f"agent failed: {type(e).__name__}: {e}")

    messages = result.get("messages", [])
    trace = _extract_trace(messages)

    final: str | None = None
    for ev in reversed(trace):
        if ev["type"] == "assistant":
            final = ev.get("content")
            break

    return {
        "ok": True,
        "answer": final,
        "trace": trace,
        "tool_nodes_used": tool_nodes_used,
        "model": model_name,
    }


def _build_agent(req: AgentRunRequest):
    agent_cfg = next((n for n in req.nodes if n.type == "agent"), None)
    if not agent_cfg:
        raise ValueError("agent node is required")

    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent

    model_name = agent_cfg.params.get("model", "gpt-4o-mini")
    temperature = float(agent_cfg.params.get("temperature", 0.2))
    system_prompt = agent_cfg.params.get("system_prompt") or (
        "당신은 도구를 활용해 사용자 질문에 정확히 답하는 한국어 조수입니다."
    )

    tools = []
    tool_nodes_used: list[str] = []
    for n in req.nodes:
        if n.type == "agent":
            continue
        t = _make_tool(n.type, n.params, api_key=req.api_key)
        if t is not None:
            tools.append(t)
            tool_nodes_used.append(n.id)

    llm = ChatOpenAI(model=model_name, temperature=temperature, api_key=req.api_key)
    agent = create_react_agent(llm, tools=tools, prompt=system_prompt)
    return agent, model_name, tool_nodes_used


def _stream_agent(req: AgentRunRequest):
    """Yields NDJSON events while a LangGraph ReAct agent runs."""
    from langchain_core.messages import AIMessage, ToolMessage, HumanMessage

    if not req.api_key:
        yield {"type": "error", "message": "api_key required"}
        return

    try:
        agent, model_name, tool_nodes_used = _build_agent(req)
    except Exception as e:
        yield {"type": "error", "message": f"{type(e).__name__}: {e}"}
        return

    yield {
        "type": "start",
        "title": "LangGraph 에이전트 실행",
        "model": model_name,
        "query": req.query,
        "tool_count": len(tool_nodes_used),
    }

    accumulated_trace: list[dict] = []
    final_answer: str | None = None
    seen_ids: set[int] = set()

    try:
        for chunk in agent.stream(
            {"messages": [("user", req.query)]},
            stream_mode="updates",
            config={"recursion_limit": 15},
        ):
            for node_name, update in chunk.items():
                yield {"type": "stage_start", "id": node_name, "label": f"graph node: {node_name}"}
                msgs = (update or {}).get("messages", []) if isinstance(update, dict) else []
                for m in msgs:
                    mid = id(m)
                    if mid in seen_ids:
                        continue
                    seen_ids.add(mid)
                    if isinstance(m, HumanMessage):
                        continue
                    if isinstance(m, AIMessage):
                        if m.tool_calls:
                            for tc in m.tool_calls:
                                name = tc.get("name") if isinstance(tc, dict) else tc["name"]
                                args = (tc.get("args") if isinstance(tc, dict) else tc["args"]) or {}
                                event = {"type": "tool_call", "name": name, "args": args}
                                accumulated_trace.append(event)
                                yield event
                        content = m.content if isinstance(m.content, str) else ""
                        if content.strip():
                            event = {"type": "assistant", "content": content}
                            accumulated_trace.append(event)
                            final_answer = content
                            yield event
                    elif isinstance(m, ToolMessage):
                        content = m.content if isinstance(m.content, str) else str(m.content)
                        truncated = content[:1500] + ("…" if len(content) > 1500 else "")
                        event = {
                            "type": "tool_result",
                            "name": getattr(m, "name", None) or "(tool)",
                            "content": truncated,
                        }
                        accumulated_trace.append(event)
                        yield event
                yield {"type": "stage_end", "id": node_name}
    except Exception as e:
        yield {"type": "error", "message": f"agent failed: {type(e).__name__}: {e}"}

    yield {
        "type": "done",
        "result": {
            "ok": True,
            "answer": final_answer,
            "trace": accumulated_trace,
            "tool_nodes_used": tool_nodes_used,
            "model": model_name,
        },
    }


@router.post("/run/stream")
def run_stream(req: AgentRunRequest):
    return ndjson_response(lambda: _stream_agent(req))


# ------------------------------------------------------------------
# Codegen: render the current canvas as a self-contained Python file
# that uses the SAME tool logic as _make_tool (no stubs).
# ------------------------------------------------------------------

_PREAMBLE = '''# LangGraph ReAct 에이전트 — 캔버스와 동일한 구성
# 실행 방법:
#   1) pip install langchain-core langchain-openai langgraph numpy openai
#   2) export OPENAI_API_KEY=...   (Windows PowerShell: $env:OPENAI_API_KEY="...")
#   3) python 이_파일.py
import os
import sys
import warnings

# Silence library deprecation noise so stderr shows only real errors.
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*LangGraphDeprecated.*")

# Force UTF-8 for stdin/stdout/stderr so Korean text survives on Windows
# where the default console code page is cp949.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
'''


def _py_func_name(node_type: str, params: dict[str, Any]) -> str:
    base = node_type.replace("tool_", "")
    if node_type == "tool_rag_retrieve":
        src = str(params.get("source", "default"))
        slug = src.replace("demo:", "").replace(".md", "").replace("-", "_").replace(".", "_")
        return f"{base}__{slug}"
    if node_type == "tool_unit_convert":
        return f"{base}__{params.get('category', 'length')}"
    if node_type == "tool_translate_text":
        return f"{base}__{params.get('target_lang', 'en')}"
    if node_type == "tool_regex_extract":
        return f"{base}__{params.get('pattern_preset', 'email')}"
    if node_type == "tool_summarize_doc":
        src = str(params.get("source", "default"))
        slug = src.replace("demo:", "").replace(".md", "").replace("-", "_").replace(".", "_")
        style = params.get("style", "bullets")
        return f"{base}__{slug}_{style}"
    return base


def _tool_def_source(node_type: str, params: dict[str, Any], name: str) -> str:
    """Functional Python source for a single tool, matching _make_tool semantics."""
    if node_type == "tool_calculator":
        return f'''
@tool
def {name}(expression: str) -> str:
    """파이썬 산술식을 계산해 결과를 문자열로 반환합니다."""
    import math
    if len(expression) > 300:
        return "식이 너무 깁니다 (300자 제한)."
    safe = {{
        "__builtins__": {{}},
        "abs": abs, "min": min, "max": max, "round": round,
        "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
        "tan": math.tan, "log": math.log, "exp": math.exp,
        "pi": math.pi, "e": math.e, "pow": pow,
    }}
    try:
        return str(eval(expression, safe, {{}}))
    except Exception as ex:
        return f"식 평가 실패: {{type(ex).__name__}}: {{ex}}"
'''

    if node_type == "tool_current_time":
        tz = str(params.get("timezone", "Asia/Seoul"))
        fmt = str(params.get("format", "%Y-%m-%d %H:%M:%S"))
        return f'''
@tool
def {name}() -> str:
    """현재 시간을 {tz} 기준 반환."""
    from datetime import datetime
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo({tz!r})
    except Exception:
        tz = None
    now = datetime.now(tz) if tz else datetime.now()
    return now.strftime({fmt!r}) + (f" ({tz!r})" if tz else "")
'''

    if node_type == "tool_regex_extract":
        preset = str(params.get("pattern_preset", "email"))
        pattern = REGEX_PRESETS.get(preset, REGEX_PRESETS["email"])
        return f'''
@tool
def {name}(text: str) -> str:
    """{preset!r} 패턴을 텍스트에서 추출."""
    import re
    pattern = {pattern!r}
    matches = re.findall(pattern, text)
    if not matches:
        return "(패턴 {preset!r} 매칭 없음)"
    unique = list(dict.fromkeys(matches))
    return "\\n".join(f"- {{m}}" for m in unique[:50])
'''

    if node_type == "tool_unit_convert":
        category = str(params.get("category", "length"))
        return f'''
@tool
def {name}(value: float, from_unit: str, to_unit: str) -> str:
    """단위 변환 ({category})."""
    _LENGTH = {{"m": 1.0, "cm": 100.0, "mm": 1000.0, "km": 0.001,
               "mi": 0.000621371, "ft": 3.28084, "in": 39.3701}}
    _MASS = {{"kg": 1.0, "g": 1000.0, "mg": 1_000_000.0, "lb": 2.20462, "oz": 35.274}}
    category = {category!r}
    try:
        value = float(value)
    except Exception:
        return f"숫자가 아님: {{value!r}}"
    if category == "temperature":
        fu, tu = from_unit.upper(), to_unit.upper()
        to_c = {{"C": lambda v: v, "F": lambda v: (v - 32) * 5 / 9, "K": lambda v: v - 273.15}}
        from_c = {{"C": lambda c: c, "F": lambda c: c * 9 / 5 + 32, "K": lambda c: c + 273.15}}
        if fu not in to_c or tu not in from_c:
            return f"지원 단위: C, F, K"
        c = to_c[fu](value)
        return f"{{value}} {{fu}} = {{from_c[tu](c):.4g}} {{tu}}"
    table = _LENGTH if category == "length" else _MASS
    if from_unit not in table or to_unit not in table:
        return f"지원 단위: {{list(table.keys())}}"
    base = value / table[from_unit]
    return f"{{value}} {{from_unit}} = {{base * table[to_unit]:.4g}} {{to_unit}}"
'''

    if node_type == "tool_word_count":
        return f'''
@tool
def {name}(text: str) -> str:
    """글자·단어·줄 수를 세어 반환."""
    chars = len(text)
    words = len(text.split())
    lines = text.count("\\n") + 1
    return f"글자 {{chars}}자 · 단어 {{words}}개 · 줄 {{lines}}줄"
'''

    if node_type == "tool_rag_retrieve":
        source = str(params.get("source", "demo:news_ai_ethics_kr.md"))
        path = source.replace("demo:", "demo_docs/")
        top_k = int(params.get("top_k", 3))
        chunk_size = int(params.get("chunk_size", 400))
        chunk_overlap = int(params.get("chunk_overlap", 40))
        return f'''
@tool
def {name}(query: str) -> str:
    """{path} 문서에서 query와 가장 관련 있는 상위 {top_k}개 청크를 반환."""
    from pathlib import Path
    import hashlib, math as _m
    import numpy as np

    def _hash_embed(text, dim=256):
        h = hashlib.sha256(text.encode("utf-8")).digest()
        vec = [(h[i % len(h)] / 127.5) - 1.0 for i in range(dim)]
        n = _m.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / n for x in vec]

    def _fixed_chunk(t, size, overlap):
        out, i = [], 0
        while i < len(t):
            out.append(t[i:i+size])
            i += size - overlap
        return out

    def _recursive_chunk(t, size, overlap):
        seps = ["\\n\\n", "\\n", ". ", " "]
        pieces = [t]
        for sep in seps:
            nxt = []
            for p in pieces:
                if len(p) <= size:
                    nxt.append(p)
                else:
                    nxt.extend(p.split(sep))
            pieces = nxt
        chunks, buf = [], ""
        for p in pieces:
            if not p.strip(): continue
            if len(buf) + len(p) + 1 <= size:
                buf = (buf + " " + p).strip() if buf else p
            else:
                if buf: chunks.append(buf)
                if len(p) > size:
                    chunks.extend(_fixed_chunk(p, size, overlap))
                    buf = ""
                else:
                    buf = p
        if buf: chunks.append(buf)
        if overlap > 0 and len(chunks) > 1:
            merged = [chunks[0]]
            for c in chunks[1:]:
                tail = merged[-1][-overlap:]
                merged.append(tail + c)
            chunks = merged
        return chunks

    text = Path({path!r}).read_text(encoding="utf-8")
    chunks = _recursive_chunk(text, {chunk_size}, {chunk_overlap})
    if not chunks:
        return "(문서에서 청크를 만들 수 없습니다)"
    vecs = np.array([_hash_embed(c) for c in chunks], dtype=np.float32)
    qv = np.array(_hash_embed(query), dtype=np.float32)
    v = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12)
    q = qv / (np.linalg.norm(qv) + 1e-12)
    sims = v @ q
    k = min({top_k}, len(chunks))
    idx = np.argsort(sims)[-k:][::-1]
    lines = [f"[{{rank+1}}] (sim={{float(sims[int(i)]):.3f}}) {{chunks[int(i)]}}"
             for rank, i in enumerate(idx)]
    return "\\n\\n".join(lines)
'''

    if node_type == "tool_read_demo_doc":
        max_chars = int(params.get("max_chars", 2000))
        return f'''
@tool
def {name}(filename: str) -> str:
    """demo_docs 디렉토리의 파일을 최대 {max_chars}자까지 반환."""
    from pathlib import Path
    path = Path("demo_docs") / filename
    if not path.exists():
        return f"(파일 없음: {{path.name}})"
    text = path.read_text(encoding="utf-8")
    return text[:{max_chars}] + ("…" if len(text) > {max_chars} else "")
'''

    if node_type == "tool_translate_text":
        target = str(params.get("target_lang", "en"))
        return f'''
@tool
def {name}(text: str) -> str:
    """텍스트를 {target}로 번역 (OpenAI gpt-4o-mini)."""
    from openai import OpenAI
    client = OpenAI()  # reads OPENAI_API_KEY from env
    resp = client.chat.completions.create(
        model="gpt-4o-mini", temperature=0,
        messages=[
            {{"role": "system", "content": f"Translate the given text to language code {target!r}. Return only the translation, no commentary."}},
            {{"role": "user", "content": text}},
        ],
    )
    return (resp.choices[0].message.content or "").strip()
'''

    if node_type == "tool_summarize_doc":
        source = str(params.get("source", "demo:news_ai_ethics_kr.md"))
        path = source.replace("demo:", "demo_docs/")
        style = str(params.get("style", "bullets"))
        return f'''
@tool
def {name}() -> str:
    """{path} 문서를 {style} 스타일로 한국어 요약 (OpenAI)."""
    from pathlib import Path
    from openai import OpenAI
    text = Path({path!r}).read_text(encoding="utf-8")[:5000]
    style_prompts = {{
        "bullets": "한국어로 핵심만 3~5개의 불릿 포인트로 요약하세요.",
        "one_line": "한국어로 한 문장으로 요약하세요.",
        "formal": "한국어로 ##섹션 헤딩을 포함한 구조적 요약을 작성하세요.",
    }}
    resp = OpenAI().chat.completions.create(
        model="gpt-4o-mini", temperature=0.2,
        messages=[
            {{"role": "system", "content": style_prompts.get({style!r}, style_prompts["bullets"])}},
            {{"role": "user", "content": text}},
        ],
    )
    return (resp.choices[0].message.content or "").strip()
'''

    return f"# unsupported tool: {node_type}\n"


def _generate_agent_python(nodes: list[NodeCfg], query: str) -> str:
    agent_cfg = next((n for n in nodes if n.type == "agent"), None)
    model = "gpt-4o-mini"
    temperature = 0.2
    system_prompt = "당신은 도구를 활용해 사용자 질문에 정확히 답하는 한국어 조수입니다."
    if agent_cfg:
        model = str(agent_cfg.params.get("model", model))
        temperature = float(agent_cfg.params.get("temperature", temperature))
        system_prompt = str(agent_cfg.params.get("system_prompt") or system_prompt)

    # Dedupe tools by (type, params) so identical configs share one def.
    import json as _json
    seen: dict[str, str] = {}
    refs: list[str] = []
    defs: list[str] = []
    for n in nodes:
        if n.type == "agent":
            continue
        key = n.type + "|" + _json.dumps(n.params, sort_keys=True, ensure_ascii=False)
        if key in seen:
            refs.append(seen[key])
            continue
        name = _py_func_name(n.type, n.params)
        seen[key] = name
        refs.append(name)
        defs.append(_tool_def_source(n.type, n.params, name))

    # Build runner.
    import json as _json2
    runner = f'''
llm = ChatOpenAI(
    model={model!r},
    temperature={temperature},
    api_key=os.environ["OPENAI_API_KEY"],
)

agent = create_react_agent(
    llm,
    tools=[{", ".join(refs) if refs else ""}],
    prompt={_json2.dumps(system_prompt, ensure_ascii=False)},
)

QUERY = {_json2.dumps(query, ensure_ascii=False)}
result = agent.invoke({{"messages": [("user", QUERY)]}}, config={{"recursion_limit": 15}})

# Print a trimmed trace + final answer.
for m in result["messages"]:
    tag = type(m).__name__
    if hasattr(m, "tool_calls") and getattr(m, "tool_calls", None):
        for tc in m.tool_calls:
            nm = tc.get("name") if isinstance(tc, dict) else tc["name"]
            args = tc.get("args") if isinstance(tc, dict) else tc["args"]
            print(f"[{{tag}}] tool_call {{nm}}({{args}})")
    else:
        content = m.content if isinstance(m.content, str) else str(m.content)
        print(f"[{{tag}}] {{content[:400]}}")
'''
    return _PREAMBLE + "\n" + "\n".join(defs) + runner


class CodegenRequest(BaseModel):
    nodes: list[NodeCfg]
    query: str = ""


@router.post("/codegen")
def codegen(req: CodegenRequest) -> dict:
    return {"code": _generate_agent_python(req.nodes, req.query)}
