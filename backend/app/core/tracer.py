import time
from typing import Any
from dataclasses import dataclass, field, asdict


@dataclass
class TraceEvent:
    node_id: str
    node_type: str
    params: dict[str, Any]
    duration_ms: float
    inputs_summary: dict[str, Any] = field(default_factory=dict)
    outputs_summary: dict[str, Any] = field(default_factory=dict)
    logs: list[str] = field(default_factory=list)


class Tracer:
    def __init__(self) -> None:
        self.events: list[TraceEvent] = []
        self._pending: TraceEvent | None = None
        self._start: float | None = None

    def begin(self, node_id: str, node_type: str, params: dict[str, Any], inputs_summary: dict[str, Any]) -> None:
        self._pending = TraceEvent(
            node_id=node_id,
            node_type=node_type,
            params=params,
            duration_ms=0.0,
            inputs_summary=inputs_summary,
        )
        self._start = time.perf_counter()

    def end(self, outputs_summary: dict[str, Any]) -> None:
        assert self._pending is not None and self._start is not None
        self._pending.duration_ms = (time.perf_counter() - self._start) * 1000.0
        self._pending.outputs_summary = outputs_summary
        self.events.append(self._pending)
        self._pending = None
        self._start = None

    def log(self, msg: str) -> None:
        if self._pending is not None:
            self._pending.logs.append(msg)

    def dump(self) -> list[dict[str, Any]]:
        return [asdict(e) for e in self.events]
