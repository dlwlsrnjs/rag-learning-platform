from .base import BaseNode, PipelineContext, register
from ..core.tracer import Tracer


SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer the user's question using ONLY the "
    "provided context. If the context is insufficient, say so briefly."
)


def _render_prompt(query: str, contexts: list[str]) -> str:
    ctx_block = "\n\n".join(f"[{i+1}] {c}" for i, c in enumerate(contexts))
    return f"Context:\n{ctx_block}\n\nQuestion: {query}"


@register("generator")
class GeneratorNode(BaseNode):
    """Generates an answer. Uses OpenAI Chat when api_key is provided;
    otherwise returns a stub that echoes the retrieved context for offline testing.

    params:
      provider: "openai" | "stub" (default "openai")
      model: str (default "gpt-4o-mini")
      temperature: float (default 0.2)
    """

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        if not ctx.query:
            raise ValueError("generator requires ctx.query")

        provider = self.params.get("provider", "openai")
        model = self.params.get("model", "gpt-4o-mini")
        temperature = float(self.params.get("temperature", 0.2))
        contexts = [c.text for c in ctx.retrieved]
        prompt = _render_prompt(ctx.query, contexts)

        if provider == "openai" and ctx.api_key:
            from openai import OpenAI

            client = OpenAI(api_key=ctx.api_key)
            resp = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            )
            ctx.answer = resp.choices[0].message.content or ""
            tracer.log(f"generated via {model}")
        else:
            preview = "\n---\n".join(contexts) or "(no context retrieved)"
            ctx.answer = (
                "[stub answer — no API key provided]\n"
                f"Question: {ctx.query}\n\n"
                f"Top retrieved context:\n{preview}"
            )
            tracer.log("stub generator used (no api_key)")
