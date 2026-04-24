from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict

NodeType = Literal["loader", "chunker", "embedder", "retriever", "generator"]


class NodeSpec(BaseModel):
    id: str
    type: NodeType
    params: dict[str, Any] = Field(default_factory=dict)


class EdgeSpec(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    src: str = Field(alias="from")
    dst: str = Field(alias="to")


class PipelineSpec(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = "pipeline"
    name: str = "Untitled Pipeline"
    nodes: list[NodeSpec]
    edges: list[EdgeSpec]
    query: str | None = None


class RunRequest(BaseModel):
    spec: PipelineSpec
    api_key: str | None = None


class CodegenRequest(BaseModel):
    spec: PipelineSpec
