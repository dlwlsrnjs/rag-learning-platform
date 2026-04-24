"""Executes user-edited Python code in a subprocess and streams stdout/stderr.

Intended for local teaching use only — runs arbitrary Python with the backend
venv's Python interpreter. Not safe for multi-tenant deployment.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from queue import Empty, Queue

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.stream import ndjson_response


def _exec_enabled() -> bool:
    """Gate the subprocess runner. Default on (local dev); public deploys
    should set ALLOW_PYTHON_EXEC=false to disable the endpoint, since it
    runs user-submitted Python on the server."""
    return os.environ.get("ALLOW_PYTHON_EXEC", "true").lower() in ("true", "1", "yes", "on")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

router = APIRouter(prefix="/run-python", tags=["run-python"])


class RunPythonRequest(BaseModel):
    code: str
    api_key: str | None = None
    timeout: int = 60


def _format_syntax_error(e: SyntaxError) -> str:
    parts = [f"SyntaxError at line {e.lineno}, col {e.offset}: {e.msg}"]
    if e.text:
        parts.append("  " + e.text.rstrip())
        if e.offset:
            parts.append("  " + " " * max(0, e.offset - 1) + "^")
    return "\n".join(parts)


def _stream_run(req: RunPythonRequest):
    yield {"type": "start", "title": "Python 실행"}

    # 1) Syntax check BEFORE spawning anything.
    try:
        compile(req.code, "<generated>", "exec")
    except SyntaxError as e:
        msg = _format_syntax_error(e)
        yield {"type": "error", "message": msg}
        yield {
            "type": "done",
            "result": {
                "ok": False,
                "stdout": "",
                "stderr": msg,
                "exit_code": None,
                "duration_ms": 0,
                "syntax_error": True,
            },
        }
        return
    yield {"type": "log", "message": "✓ 문법 검사 통과, subprocess 실행 중…"}

    # 2) Build env. Pass the user's OpenAI key as env var so generated code
    #    that reads os.environ["OPENAI_API_KEY"] works.
    env = os.environ.copy()
    # Force UTF-8 for stdin/stdout/stderr so Korean text survives the
    # subprocess boundary on Windows (default is cp949 when stdout is a pipe).
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if req.api_key:
        env["OPENAI_API_KEY"] = req.api_key

    # 3) Write to a temp file so tracebacks point at something readable.
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as tmp:
        tmp.write(req.code)
        script_path = tmp.name

    t0 = time.perf_counter()
    proc: subprocess.Popen | None = None
    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    timeout_s = max(5, min(req.timeout, 300))

    try:
        yield {"type": "stage_start", "id": "python", "label": f"python 스크립트 실행"}
        proc = subprocess.Popen(
            [sys.executable, "-u", script_path],  # -u = unbuffered stdout/stderr
            cwd=str(DATA_DIR),  # so "demo_docs/..." paths resolve
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        q: Queue = Queue()

        def reader(stream, tag: str):
            try:
                for line in iter(stream.readline, ""):
                    q.put((tag, line.rstrip("\n")))
            finally:
                q.put((tag, None))

        t_out = threading.Thread(target=reader, args=(proc.stdout, "stdout"), daemon=True)
        t_err = threading.Thread(target=reader, args=(proc.stderr, "stderr"), daemon=True)
        t_out.start()
        t_err.start()

        finished = 0
        while finished < 2:
            try:
                tag, line = q.get(timeout=0.5)
            except Empty:
                if time.perf_counter() - t0 > timeout_s:
                    proc.kill()
                    yield {
                        "type": "error",
                        "message": f"타임아웃: {timeout_s}초 초과. 프로세스를 종료했습니다.",
                    }
                    break
                continue
            if line is None:
                finished += 1
                continue
            if tag == "stdout":
                stdout_lines.append(line)
                yield {"type": "log", "message": line}
            else:
                stderr_lines.append(line)
                yield {"type": "log", "message": f"[stderr] {line}"}

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

        duration_ms = (time.perf_counter() - t0) * 1000
        exit_code = proc.returncode
        yield {
            "type": "stage_end",
            "id": "python",
            "duration_ms": duration_ms,
            "summary": f"exit={exit_code} · {duration_ms:.0f}ms",
        }
        yield {
            "type": "done",
            "result": {
                "ok": exit_code == 0,
                "stdout": "\n".join(stdout_lines)[:20000],
                "stderr": "\n".join(stderr_lines)[:10000],
                "exit_code": exit_code,
                "duration_ms": duration_ms,
                "syntax_error": False,
            },
        }
    except Exception as e:  # noqa: BLE001 - surface to client
        yield {"type": "error", "message": f"실행 실패: {type(e).__name__}: {e}"}
        yield {
            "type": "done",
            "result": {
                "ok": False,
                "stdout": "\n".join(stdout_lines)[:20000],
                "stderr": (f"{type(e).__name__}: {e}\n" + "\n".join(stderr_lines))[:10000],
                "exit_code": None,
                "duration_ms": (time.perf_counter() - t0) * 1000,
                "syntax_error": False,
            },
        }
    finally:
        if proc and proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass
        try:
            os.unlink(script_path)
        except Exception:
            pass


@router.post("/stream")
def run_stream(req: RunPythonRequest):
    if not _exec_enabled():
        raise HTTPException(
            403,
            "Python execution is disabled on this deployment. "
            "Set ALLOW_PYTHON_EXEC=true to enable (local/dev only).",
        )
    return ndjson_response(lambda: _stream_run(req))
