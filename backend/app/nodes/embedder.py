import hashlib
import math
from .base import BaseNode, PipelineContext, register
from ..core.tracer import Tracer


def _hash_embed(text: str, dim: int = 256) -> list[float]:
    """Deterministic pseudo-embedding for offline/no-key use.
    Not semantically meaningful — only for wiring tests.
    """
    h = hashlib.sha256(text.encode("utf-8")).digest()
    vec = []
    # Expand hash bytes to `dim` floats in [-1, 1].
    for i in range(dim):
        b = h[i % len(h)]
        vec.append((b / 127.5) - 1.0)
    # L2 normalize
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


@register("embedder")
class EmbedderNode(BaseNode):
    """Embeds chunks. Uses OpenAI when provider=openai and api_key is set;
    otherwise falls back to a deterministic hash embedder.

    params:
      provider: "openai" | "hash" (default "openai")
      model: str (default "text-embedding-3-small")
    """

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        provider = self.params.get("provider", "openai")
        model = self.params.get("model", "text-embedding-3-small")
        texts = [c.text for c in ctx.chunks]

        if provider == "openai" and ctx.api_key:
            from openai import OpenAI

            client = OpenAI(api_key=ctx.api_key)
            resp = client.embeddings.create(model=model, input=texts)
            ctx.embeddings = [d.embedding for d in resp.data]
            tracer.log(f"embedded {len(texts)} chunks via OpenAI {model}")
        else:
            ctx.embeddings = [_hash_embed(t) for t in texts]
            tracer.log(
                f"embedded {len(texts)} chunks via hash-fallback "
                f"(no api_key or provider={provider})"
            )
