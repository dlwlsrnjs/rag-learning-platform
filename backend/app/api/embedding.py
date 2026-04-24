from pathlib import Path
import time
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..nodes.chunker import recursive_chunk
from ..nodes.embedder import _hash_embed
from ..core.stream import ndjson_response

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/embedding", tags=["embedding"])

OPENAI_MODELS = {"text-embedding-3-small", "text-embedding-3-large"}


class CompareRequest(BaseModel):
    source: str
    query: str
    models: list[str]
    chunk_size: int = 400
    chunk_overlap: int = 40
    top_k: int = 4
    api_key: str | None = None


def _load(source: str) -> str:
    if source.startswith("demo:"):
        path = DEMO_DIR / source.removeprefix("demo:")
        if not path.exists():
            raise HTTPException(404, f"demo not found: {path.name}")
        return path.read_text(encoding="utf-8")
    if source.startswith("text:"):
        return source.removeprefix("text:")
    raise HTTPException(400, f"unsupported source: {source}")


def _cosine_topk(mat: np.ndarray, q: np.ndarray, k: int) -> tuple[list[int], list[float]]:
    mat_n = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-12)
    q_n = q / (np.linalg.norm(q) + 1e-12)
    sims = mat_n @ q_n
    idx = np.argsort(sims)[-k:][::-1]
    return [int(i) for i in idx], [float(sims[i]) for i in idx]


@router.post("/compare")
def compare(req: CompareRequest) -> dict:
    if not req.models:
        raise HTTPException(400, "models list is empty")

    text = _load(req.source)
    chunks = recursive_chunk(text, req.chunk_size, req.chunk_overlap)
    if not chunks:
        raise HTTPException(400, "no chunks produced")

    results: list[dict] = []
    openai_client = None
    for model in req.models:
        err = None
        items: list[dict] = []
        try:
            if model == "hash":
                vecs = np.array([_hash_embed(c) for c in chunks], dtype=np.float32)
                qvec = np.array(_hash_embed(req.query), dtype=np.float32)
            elif model in OPENAI_MODELS:
                if not req.api_key:
                    raise ValueError(f"api_key required for model {model}")
                if openai_client is None:
                    from openai import OpenAI
                    openai_client = OpenAI(api_key=req.api_key)
                emb = openai_client.embeddings.create(model=model, input=chunks)
                vecs = np.array([d.embedding for d in emb.data], dtype=np.float32)
                qr = openai_client.embeddings.create(model=model, input=[req.query])
                qvec = np.array(qr.data[0].embedding, dtype=np.float32)
            else:
                raise ValueError(f"unsupported model: {model}")

            idx, scores = _cosine_topk(vecs, qvec, min(req.top_k, len(chunks)))
            for rank, (i, s) in enumerate(zip(idx, scores)):
                txt = chunks[i]
                items.append({
                    "rank": rank + 1,
                    "chunk_index": i,
                    "score": round(s, 4),
                    "preview": txt[:220] + ("…" if len(txt) > 220 else ""),
                })
            results.append({
                "model": model,
                "dim": int(vecs.shape[1]),
                "top_chunks": items,
            })
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            results.append({"model": model, "error": err, "top_chunks": []})

    # Compute how much each pair of models overlap in their top-k selections.
    overlaps: list[dict] = []
    successful = [r for r in results if "error" not in r]
    for i in range(len(successful)):
        for j in range(i + 1, len(successful)):
            a = {c["chunk_index"] for c in successful[i]["top_chunks"]}
            b = {c["chunk_index"] for c in successful[j]["top_chunks"]}
            inter = len(a & b)
            overlaps.append({
                "a": successful[i]["model"],
                "b": successful[j]["model"],
                "shared": inter,
                "total_k": req.top_k,
            })

    return {
        "doc_chars": len(text),
        "total_chunks": len(chunks),
        "results": results,
        "overlaps": overlaps,
    }


def _stream_compare(req: CompareRequest):
    yield {"type": "start", "title": "임베딩 모델 비교", "total": len(req.models)}
    try:
        text = _load(req.source)
    except HTTPException as he:
        yield {"type": "error", "message": he.detail}
        return
    yield {"type": "log", "message": f"문서 로드: {len(text):,}자"}

    chunks = recursive_chunk(text, req.chunk_size, req.chunk_overlap)
    if not chunks:
        yield {"type": "error", "message": "no chunks produced"}
        return
    yield {"type": "log", "message": f"청킹 완료: {len(chunks)}개 (size={req.chunk_size}, overlap={req.chunk_overlap})"}

    results: list[dict] = []
    openai_client = None
    for idx, model in enumerate(req.models):
        yield {
            "type": "stage_start",
            "id": model,
            "label": f"{model} 임베딩 중",
            "index": idx + 1,
            "total": len(req.models),
        }
        t0 = time.perf_counter()
        items: list[dict] = []
        try:
            if model == "hash":
                vecs = np.array([_hash_embed(c) for c in chunks], dtype=np.float32)
                qvec = np.array(_hash_embed(req.query), dtype=np.float32)
            elif model in OPENAI_MODELS:
                if not req.api_key:
                    raise ValueError(f"api_key required for model {model}")
                if openai_client is None:
                    from openai import OpenAI
                    openai_client = OpenAI(api_key=req.api_key)
                yield {"type": "log", "message": f"  · OpenAI에 {len(chunks)}개 청크 임베딩 요청"}
                emb = openai_client.embeddings.create(model=model, input=chunks)
                vecs = np.array([d.embedding for d in emb.data], dtype=np.float32)
                yield {"type": "log", "message": f"  · 쿼리 임베딩 요청"}
                qr = openai_client.embeddings.create(model=model, input=[req.query])
                qvec = np.array(qr.data[0].embedding, dtype=np.float32)
            else:
                raise ValueError(f"unsupported model: {model}")
            idx_list, scores = _cosine_topk(vecs, qvec, min(req.top_k, len(chunks)))
            for rank, (i, s) in enumerate(zip(idx_list, scores)):
                items.append({
                    "rank": rank + 1,
                    "chunk_index": i,
                    "score": round(s, 4),
                    "preview": chunks[i][:220] + ("…" if len(chunks[i]) > 220 else ""),
                })
            results.append({"model": model, "dim": int(vecs.shape[1]), "top_chunks": items})
            dur = (time.perf_counter() - t0) * 1000
            yield {"type": "stage_end", "id": model, "duration_ms": dur, "summary": f"top-{len(items)} 검색 · {dur:.0f}ms"}
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}"
            results.append({"model": model, "error": err_msg, "top_chunks": []})
            yield {"type": "error", "stage": model, "message": err_msg}

    overlaps: list[dict] = []
    successful = [r for r in results if "error" not in r]
    for i in range(len(successful)):
        for j in range(i + 1, len(successful)):
            a = {c["chunk_index"] for c in successful[i]["top_chunks"]}
            b = {c["chunk_index"] for c in successful[j]["top_chunks"]}
            overlaps.append({
                "a": successful[i]["model"],
                "b": successful[j]["model"],
                "shared": len(a & b),
                "total_k": req.top_k,
            })

    yield {
        "type": "done",
        "result": {
            "doc_chars": len(text),
            "total_chunks": len(chunks),
            "results": results,
            "overlaps": overlaps,
        },
    }


@router.post("/compare/stream")
def compare_stream(req: CompareRequest):
    return ndjson_response(lambda: _stream_compare(req))
