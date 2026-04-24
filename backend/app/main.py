import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env before importing routers so os.environ is populated.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .api import pipelines, documents, chunk, news, optimize, embedding, agent, run_python  # noqa: E402

app = FastAPI(title="RAG Learning Site API", version="0.1.0")

_cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipelines.router)
app.include_router(documents.router)
app.include_router(chunk.router)
app.include_router(news.router)
app.include_router(optimize.router)
app.include_router(embedding.router)
app.include_router(agent.router)
app.include_router(run_python.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/node-types")
def node_types() -> dict:
    """Shape hints that future GUI panels can render into a parameter form."""
    return {
        "loader": {
            "description": "Load a document (demo file or inline text).",
            "params": {
                "source": {
                    "type": "string",
                    "default": "demo:rag_explained.md",
                    "help": "Use 'demo:<filename>' or 'text:<inline>'.",
                }
            },
        },
        "chunker": {
            "description": "Split text into chunks.",
            "params": {
                "strategy": {"type": "enum", "options": ["recursive", "fixed"], "default": "recursive"},
                "chunk_size": {"type": "int", "default": 500, "min": 50, "max": 4000},
                "chunk_overlap": {"type": "int", "default": 50, "min": 0, "max": 1000},
            },
        },
        "embedder": {
            "description": "Embed chunks. Falls back to a hash embedder without an API key.",
            "params": {
                "provider": {"type": "enum", "options": ["openai", "hash"], "default": "openai"},
                "model": {"type": "string", "default": "text-embedding-3-small"},
            },
        },
        "retriever": {
            "description": "Return top-k chunks by cosine similarity.",
            "params": {
                "top_k": {"type": "int", "default": 4, "min": 1, "max": 20},
                "provider": {"type": "enum", "options": ["openai", "hash"], "default": "openai"},
                "model": {"type": "string", "default": "text-embedding-3-small"},
            },
        },
        "generator": {
            "description": "Produce an answer from the query + retrieved context.",
            "params": {
                "provider": {"type": "enum", "options": ["openai", "stub"], "default": "openai"},
                "model": {"type": "string", "default": "gpt-4o-mini"},
                "temperature": {"type": "float", "default": 0.2, "min": 0.0, "max": 2.0},
            },
        },
    }
