import numpy as np
from .base import BaseNode, PipelineContext, register
from .embedder import _hash_embed
from ..core.tracer import Tracer


@register("retriever")
class RetrieverNode(BaseNode):
    """Embeds the query with the same scheme and returns top-k chunks by cosine similarity.

    params:
      top_k: int (default 4)
      provider: "openai" | "hash" (must match embedder; default "openai")
      model: str (default "text-embedding-3-small")
    """

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        if not ctx.query:
            raise ValueError("retriever requires ctx.query")
        if not ctx.embeddings:
            raise ValueError("retriever requires embeddings from an earlier node")

        top_k = int(self.params.get("top_k", 4))
        provider = self.params.get("provider", "openai")
        model = self.params.get("model", "text-embedding-3-small")

        if provider == "openai" and ctx.api_key:
            from openai import OpenAI

            client = OpenAI(api_key=ctx.api_key)
            resp = client.embeddings.create(model=model, input=[ctx.query])
            q_vec = np.array(resp.data[0].embedding, dtype=np.float32)
        else:
            q_vec = np.array(_hash_embed(ctx.query), dtype=np.float32)

        mat = np.array(ctx.embeddings, dtype=np.float32)
        # cosine similarity (embeddings are not guaranteed normalized from OpenAI — normalize here)
        mat_norm = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-12)
        q_norm = q_vec / (np.linalg.norm(q_vec) + 1e-12)
        sims = mat_norm @ q_norm

        top_k = min(top_k, len(ctx.chunks))
        idx = np.argsort(sims)[-top_k:][::-1]
        ctx.retrieved = [ctx.chunks[int(i)] for i in idx]
        tracer.log(
            f"retrieved top-{top_k} (scores={[round(float(sims[i]), 3) for i in idx]})"
        )
