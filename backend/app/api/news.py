import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_docs"

router = APIRouter(prefix="/news", tags=["news"])


# Bundled Korean news samples. Each entry tells the UI what the file is about
# without having to read it. `source` uses the same "demo:<file>" form the
# loader node understands, so these can be dropped straight into a pipeline.
BUNDLED = [
    {
        "id": "ai_ethics",
        "source": "demo:news_ai_ethics_kr.md",
        "title": "국내 AI 기업 7곳, 공동 윤리 가이드라인 발표",
        "category": "기술/정책",
        "tags": ["AI", "윤리", "규제", "가이드라인"],
        "default_query": "가이드라인에 참여한 기업들과 다섯 가지 원칙은 무엇인가?",
    },
    {
        "id": "climate",
        "source": "demo:news_climate_kr.md",
        "title": "아시아 기후 회의 폐막, 2030 감축 목표 상향 합의",
        "category": "환경",
        "tags": ["기후", "탄소", "에너지", "국제"],
        "default_query": "아시아 기후 기금의 초기 규모는 얼마이고 각국의 분담금은 어떻게 구성되어 있나?",
    },
    {
        "id": "space",
        "source": "demo:news_space_kr.md",
        "title": "민간 달 착륙선 '한빛-1호' 교신 성공",
        "category": "과학/우주",
        "tags": ["우주", "달", "민간", "과학"],
        "default_query": "한빛-1호가 착륙한 지점의 좌표와 수집할 시료의 양은 얼마인가?",
    },
    {
        "id": "kpop",
        "source": "demo:news_kpop_kr.md",
        "title": "K-POP '에이리스' 남미 6개 도시 투어 전회차 매진",
        "category": "문화",
        "tags": ["K-POP", "공연", "남미", "문화"],
        "default_query": "에이리스 남미 투어의 공연 도시와 총 관람 인원·티켓 판매액은 얼마인가?",
    },
    {
        "id": "economy",
        "source": "demo:news_economy_kr.md",
        "title": "한국은행 기준금리 0.25%P 인하, 연 2.75%",
        "category": "경제/금융",
        "tags": ["금리", "한은", "경기", "환율"],
        "default_query": "한국은행은 기준금리를 왜 인하했고 이번 결정이 국고채·환율에 어떤 영향을 줬나?",
    },
]


def _load_text(source: str) -> str:
    name = source.removeprefix("demo:")
    return (DEMO_DIR / name).read_text(encoding="utf-8")


@router.get("/samples")
def samples() -> dict:
    """Returns the bundled news samples with metadata + char counts."""
    out = []
    for item in BUNDLED:
        text = _load_text(item["source"])
        preview = text.split("\n\n", 1)[0].lstrip("# ").strip()
        out.append({**item, "chars": len(text), "preview": preview})
    return {"samples": out}


class NewsSearchRequest(BaseModel):
    keyword: str
    news_api_key: str | None = None  # optional NewsAPI.org key for live search
    language: str = "ko"
    page_size: int = 10


@router.post("/search")
def search(req: NewsSearchRequest) -> dict:
    """Keyword search. Always returns bundled matches first. If a NewsAPI.org
    key is provided, also returns a list of live article metadata (title,
    description, url, publishedAt, content snippet). The frontend can then
    inline the selected article text into a pipeline via a text: source.
    """
    kw = req.keyword.strip().lower()
    if not kw:
        raise HTTPException(400, "keyword is required")

    # bundled matching: title/tag/category/content
    matched_bundled: list[dict] = []
    for item in BUNDLED:
        text = _load_text(item["source"])
        haystack = " ".join([
            item["title"], item["category"], " ".join(item["tags"]), text,
        ]).lower()
        if kw in haystack:
            matched_bundled.append({
                **item,
                "chars": len(text),
                "snippet": _snippet(text, kw),
            })

    # Fall back to the server-side NEWS_API_KEY if the client did not send one.
    effective_key = req.news_api_key or os.environ.get("NEWS_API_KEY")
    live: list[dict] = []
    live_error: str | None = None
    if effective_key:
        try:
            live = _fetch_newsapi(req.keyword, effective_key, req.language, req.page_size)
        except Exception as e:
            live_error = f"{type(e).__name__}: {e}"

    return {
        "keyword": req.keyword,
        "bundled": matched_bundled,
        "live": live,
        "live_error": live_error,
        "live_used": effective_key is not None,
    }


def _snippet(text: str, kw: str, window: int = 80) -> str:
    idx = text.lower().find(kw)
    if idx < 0:
        return text[:160] + ("…" if len(text) > 160 else "")
    start = max(0, idx - window)
    end = min(len(text), idx + len(kw) + window)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end] + suffix


def _fetch_newsapi(keyword: str, key: str, language: str, page_size: int) -> list[dict]:
    import httpx

    params = {
        "q": keyword,
        "apiKey": key,
        "language": language,
        "pageSize": max(1, min(page_size, 20)),
        "sortBy": "publishedAt",
    }
    r = httpx.get("https://newsapi.org/v2/everything", params=params, timeout=10.0)
    r.raise_for_status()
    data = r.json()
    if data.get("status") != "ok":
        raise RuntimeError(data.get("message", "NewsAPI returned non-ok status"))
    return [
        {
            "title": a.get("title"),
            "description": a.get("description"),
            "source": (a.get("source") or {}).get("name"),
            "published_at": a.get("publishedAt"),
            "url": a.get("url"),
            # NewsAPI free tier truncates `content` to ~200 chars.
            # We return description+content so the user can decide whether to
            # ingest it (short) or just use it as a pointer.
            "content": (a.get("content") or "") or (a.get("description") or ""),
        }
        for a in data.get("articles", [])
    ]
