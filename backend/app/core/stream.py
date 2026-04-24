import json
from typing import Any, Callable, Iterable
from fastapi.responses import StreamingResponse


def ndjson_response(gen_fn: Callable[[], Iterable[dict[str, Any]]]) -> StreamingResponse:
    """Wrap a generator of dict events into an NDJSON streaming response.

    Each event is JSON-encoded on its own line with a trailing newline.
    Exceptions raised inside the generator are converted into an `error`
    event so the client always gets a clean stream end.
    """

    def iterator():
        try:
            for event in gen_fn():
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except Exception as e:  # noqa: BLE001 - surface to client
            yield json.dumps(
                {"type": "error", "message": f"{type(e).__name__}: {e}"},
                ensure_ascii=False,
            ) + "\n"

    # Disable buffering on any reverse proxies that read this header.
    return StreamingResponse(
        iterator(),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
