from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

from .spec import PipelineSpec

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _group_nodes(spec: PipelineSpec) -> dict[str, dict]:
    """Returns the first node of each type as a simple dict for the template."""
    out: dict[str, dict] = {}
    for n in spec.nodes:
        if n.type not in out:
            out[n.type] = {"id": n.id, "params": n.params}
    return out


def generate_python(spec: PipelineSpec) -> str:
    nodes = _group_nodes(spec)
    required = {"loader", "chunker", "embedder", "retriever", "generator"}
    missing = required - nodes.keys()
    if missing:
        raise ValueError(f"codegen requires these node types: {sorted(missing)} missing")

    template = _env.get_template("pipeline.py.j2")
    return template.render(
        query=spec.query or "What is this document about?",
        loader=nodes["loader"]["params"],
        chunker=nodes["chunker"]["params"],
        embedder=nodes["embedder"]["params"],
        retriever=nodes["retriever"]["params"],
        generator=nodes["generator"]["params"],
    )
