from pathlib import Path
from fastapi import APIRouter, HTTPException

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_docs() -> dict:
    if not DEMO_DIR.exists():
        return {"documents": []}
    docs = []
    for p in sorted(DEMO_DIR.iterdir()):
        if p.is_file():
            docs.append(
                {
                    "id": p.name,
                    "source": f"demo:{p.name}",
                    "chars": p.stat().st_size,
                }
            )
    return {"documents": docs}


@router.get("/{name}")
def get_doc(name: str) -> dict:
    path = DEMO_DIR / name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return {"id": name, "text": path.read_text(encoding="utf-8")}
