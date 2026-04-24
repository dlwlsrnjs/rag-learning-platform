from fastapi import APIRouter, HTTPException
from ..core.spec import RunRequest, CodegenRequest
from ..core.executor import run_pipeline, run_pipeline_iter
from ..core.codegen import generate_python
from ..core.stream import ndjson_response

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.post("/run")
def run(req: RunRequest) -> dict:
    try:
        return run_pipeline(req.spec, api_key=req.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/run/stream")
def run_stream(req: RunRequest):
    return ndjson_response(lambda: run_pipeline_iter(req.spec, api_key=req.api_key))


@router.post("/codegen")
def codegen(req: CodegenRequest) -> dict:
    try:
        code = generate_python(req.spec)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"language": "python", "code": code}
