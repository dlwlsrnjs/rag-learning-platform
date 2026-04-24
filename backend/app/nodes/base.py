from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable

from ..core.tracer import Tracer


@dataclass
class Document:
    id: str
    text: str
    source: str


@dataclass
class Chunk:
    id: str
    text: str
    doc_id: str
    index: int


@dataclass
class PipelineContext:
    query: str | None = None
    api_key: str | None = None
    documents: list[Document] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)
    embeddings: list[list[float]] = field(default_factory=list)
    retrieved: list[Chunk] = field(default_factory=list)
    answer: str | None = None


class BaseNode:
    type: str = "base"

    def __init__(self, **params: Any) -> None:
        self.params = params

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        raise NotImplementedError


NODE_REGISTRY: dict[str, type[BaseNode]] = {}


def register(node_type: str) -> Callable[[type[BaseNode]], type[BaseNode]]:
    def deco(cls: type[BaseNode]) -> type[BaseNode]:
        cls.type = node_type
        NODE_REGISTRY[node_type] = cls
        return cls
    return deco
