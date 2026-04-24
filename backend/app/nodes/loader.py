from pathlib import Path
from .base import BaseNode, Document, PipelineContext, register
from ..core.tracer import Tracer

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"


@register("loader")
class LoaderNode(BaseNode):
    """Loads a demo document or raw text into ctx.documents.

    params:
      source: "demo:<filename>"  | "text:<inline text>"
    """

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        source = self.params.get("source", "demo:ai_intro.md")
        if source.startswith("demo:"):
            name = source.removeprefix("demo:")
            path = DEMO_DIR / name
            if not path.exists():
                raise FileNotFoundError(f"Demo doc not found: {name}")
            text = path.read_text(encoding="utf-8")
            doc = Document(id=name, text=text, source=str(path))
        elif source.startswith("text:"):
            text = source.removeprefix("text:")
            doc = Document(id="inline", text=text, source="inline")
        else:
            raise ValueError(f"Unknown source: {source}")

        ctx.documents.append(doc)
        tracer.log(f"loaded {doc.id} ({len(doc.text)} chars)")
