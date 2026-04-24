from collections import defaultdict, deque
from dataclasses import asdict

from .spec import PipelineSpec
from .tracer import Tracer
from ..nodes import NODE_REGISTRY
from ..nodes.base import PipelineContext


def topo_sort(spec: PipelineSpec) -> list[str]:
    node_ids = [n.id for n in spec.nodes]
    indeg: dict[str, int] = {nid: 0 for nid in node_ids}
    graph: dict[str, list[str]] = defaultdict(list)
    for e in spec.edges:
        graph[e.src].append(e.dst)
        indeg[e.dst] = indeg.get(e.dst, 0) + 1
    queue = deque([nid for nid in node_ids if indeg[nid] == 0])
    order: list[str] = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in graph[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    if len(order) != len(node_ids):
        raise ValueError("Pipeline has a cycle")
    return order


def _snapshot(ctx: PipelineContext) -> dict:
    return {
        "documents": [{"id": d.id, "chars": len(d.text)} for d in ctx.documents],
        "chunks": len(ctx.chunks),
        "embeddings": len(ctx.embeddings),
        "retrieved": [
            {"id": c.id, "preview": c.text[:160]} for c in ctx.retrieved
        ],
        "answer_preview": (ctx.answer[:240] + "…") if ctx.answer and len(ctx.answer) > 240 else ctx.answer,
    }


def run_pipeline(spec: PipelineSpec, *, api_key: str | None = None) -> dict:
    tracer = Tracer()
    order = topo_sort(spec)
    node_by_id = {n.id: n for n in spec.nodes}
    ctx = PipelineContext(query=spec.query, api_key=api_key)

    for nid in order:
        ns = node_by_id[nid]
        NodeCls = NODE_REGISTRY.get(ns.type)
        if NodeCls is None:
            raise ValueError(f"Unknown node type: {ns.type}")
        node = NodeCls(**ns.params)

        inputs_summary = _snapshot(ctx)
        tracer.begin(ns.id, ns.type, ns.params, inputs_summary)
        try:
            node.run(ctx, tracer=tracer)
        except Exception as e:
            tracer.log(f"error: {type(e).__name__}: {e}")
            tracer.end(_snapshot(ctx))
            return {
                "ok": False,
                "error": f"{type(e).__name__}: {e}",
                "trace": [asdict(ev) for ev in tracer.events],
                "answer": ctx.answer,
            }
        tracer.end(_snapshot(ctx))

    return {
        "ok": True,
        "trace": [asdict(ev) for ev in tracer.events],
        "answer": ctx.answer,
    }


def run_pipeline_iter(spec: PipelineSpec, *, api_key: str | None = None):
    """Streaming variant: yields NDJSON-friendly dict events.

    Events: start / stage_start / stage_end / error / done.
    """
    tracer = Tracer()
    order = topo_sort(spec)
    node_by_id = {n.id: n for n in spec.nodes}
    ctx = PipelineContext(query=spec.query, api_key=api_key)

    yield {
        "type": "start",
        "title": "파이프라인 실행",
        "total": len(order),
        "query": spec.query,
    }

    for idx, nid in enumerate(order):
        ns = node_by_id[nid]
        NodeCls = NODE_REGISTRY.get(ns.type)
        if NodeCls is None:
            yield {"type": "error", "message": f"Unknown node type: {ns.type}"}
            return
        node = NodeCls(**ns.params)

        yield {
            "type": "stage_start",
            "id": nid,
            "label": f"{ns.type} ({nid})",
            "index": idx + 1,
            "total": len(order),
        }
        inputs_summary = _snapshot(ctx)
        tracer.begin(ns.id, ns.type, ns.params, inputs_summary)
        try:
            node.run(ctx, tracer=tracer)
        except Exception as e:
            tracer.log(f"error: {type(e).__name__}: {e}")
            tracer.end(_snapshot(ctx))
            yield {
                "type": "error",
                "stage": nid,
                "message": f"{type(e).__name__}: {e}",
            }
            yield {
                "type": "done",
                "result": {
                    "ok": False,
                    "error": f"{type(e).__name__}: {e}",
                    "trace": [asdict(ev) for ev in tracer.events],
                    "answer": ctx.answer,
                },
            }
            return
        tracer.end(_snapshot(ctx))
        last = tracer.events[-1]
        yield {
            "type": "stage_end",
            "id": nid,
            "duration_ms": last.duration_ms,
            "logs": last.logs,
            "outputs_summary": last.outputs_summary,
        }

    yield {
        "type": "done",
        "result": {
            "ok": True,
            "trace": [asdict(ev) for ev in tracer.events],
            "answer": ctx.answer,
        },
    }
