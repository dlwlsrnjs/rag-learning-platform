from pathlib import Path
from statistics import mean
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..nodes.chunker import fixed_chunk, recursive_chunk

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/chunk", tags=["chunk"])


class ChunkConfig(BaseModel):
    label: str
    strategy: Literal["fixed", "recursive"] = "recursive"
    chunk_size: int = 500
    chunk_overlap: int = 50


class ChunkPreviewRequest(BaseModel):
    source: str  # "demo:<filename>" or "text:<inline>"
    configs: list[ChunkConfig]
    preview_chars: int = 180


def _load(source: str) -> str:
    if source.startswith("demo:"):
        path = DEMO_DIR / source.removeprefix("demo:")
        if not path.exists():
            raise HTTPException(404, f"demo doc not found: {path.name}")
        return path.read_text(encoding="utf-8")
    if source.startswith("text:"):
        return source.removeprefix("text:")
    raise HTTPException(400, f"unsupported source: {source}")


def _stats(chunks: list[str]) -> dict:
    if not chunks:
        return {"count": 0, "mean_len": 0, "min_len": 0, "max_len": 0}
    lens = [len(c) for c in chunks]
    return {
        "count": len(chunks),
        "mean_len": round(mean(lens), 1),
        "min_len": min(lens),
        "max_len": max(lens),
    }


@router.post("/preview")
def preview(req: ChunkPreviewRequest) -> dict:
    text = _load(req.source)
    results = []
    for cfg in req.configs:
        try:
            splitter = recursive_chunk if cfg.strategy == "recursive" else fixed_chunk
            chunks = splitter(text, cfg.chunk_size, cfg.chunk_overlap)
        except ValueError as e:
            results.append({"config": cfg.model_dump(), "error": str(e)})
            continue

        previews = [
            {
                "index": i,
                "length": len(c),
                "preview": c[: req.preview_chars]
                + ("…" if len(c) > req.preview_chars else ""),
            }
            for i, c in enumerate(chunks)
        ]
        results.append(
            {
                "config": cfg.model_dump(),
                "stats": _stats(chunks),
                "chunks": previews,
            }
        )
    return {"source": req.source, "doc_chars": len(text), "results": results}
