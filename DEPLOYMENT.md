# 배포 가이드

이 저장소를 공개 URL로 띄우는 가장 빠른 경로:

- **프론트엔드 (Next.js) → Vercel**: push → 자동 배포, 무료 티어
- **백엔드 (FastAPI) → Render**: push → 자동 배포, 무료 티어 (15분 무통신 시 슬립)

각 플랫폼이 GitHub 리포를 주시하다가 `main`에 push가 되면 알아서 빌드·배포합니다. 별도 GitHub Actions deploy 워크플로는 필요 없어요. (이 저장소의 `.github/workflows/ci.yml`은 빌드 검증 용도만.)

---

## 1. 백엔드 → Render

### 1-1. 회원가입 · 리포 연결

1. https://render.com → GitHub 계정으로 가입
2. 대시보드에서 **"New +" → "Blueprint"**
3. **"rag-learning-platform"** 리포 선택 → Render가 루트의 `render.yaml`을 자동 인식

### 1-2. 환경변수 설정 (블루프린트 연결 후)

Render 대시보드 → `rag-backend` 서비스 → **Environment** 탭:

| Key | Value | 설명 |
|-----|-------|------|
| `NEWS_API_KEY` | `9ca9195f9da94f338231b8cce6efbb11` | 기존 로컬 `.env` 값 그대로 (또는 새 키) |
| `CORS_ORIGINS` | `https://<your-frontend>.vercel.app` | Vercel 배포 완료 후 설정 (쉼표로 여러 도메인 가능) |
| `ALLOW_PYTHON_EXEC` | `false` | 공개 배포에선 꺼두길 강력 권장 |
| `PYTHON_VERSION` | `3.12.10` | 블루프린트에 이미 있음 |

Save → Render가 자동 재배포합니다.

### 1-3. URL 확인

배포 끝나면 `https://rag-backend-xxxx.onrender.com` 같은 URL이 뜹니다. 다음 경로로 헬스 체크:

```
https://rag-backend-xxxx.onrender.com/health
→ {"ok": true}
```

이 URL을 복사해 두세요 — 프론트에서 씁니다.

### 1-4. 무료 티어 특성

- 512MB RAM, 0.1 CPU — 데모·강의용으로는 OK
- **15분간 요청 없으면 슬립** → 다음 요청이 30~60초 걸림 (콜드 스타트). 수업 직전에 한 번 깨워 두세요.
- 상시 가동이 필요하면 유료 플랜 ($7/월).

---

## 2. 프론트엔드 → Vercel

### 2-1. 회원가입 · 리포 연결

1. https://vercel.com → GitHub 계정으로 가입
2. **"Add New... → Project"** → `rag-learning-platform` 리포 import
3. **중요: "Root Directory"** 를 `frontend` 로 설정 (모노레포라서)
4. Framework Preset은 Next.js 자동 감지됨

### 2-2. 환경변수 설정

"Environment Variables" 섹션:

| Key | Value |
|-----|-------|
| `BACKEND_URL` | `https://rag-backend-xxxx.onrender.com` (위에서 복사한 Render URL, 끝에 `/` 없이) |

### 2-3. Deploy 클릭

몇 분 후 `https://rag-learning-platform-xxxx.vercel.app` URL 생성.

### 2-4. 백엔드 CORS 업데이트

Render 대시보드 → 1-2에서 설정한 `CORS_ORIGINS` 에 Vercel URL을 넣고 저장:

```
CORS_ORIGINS=https://rag-learning-platform-xxxx.vercel.app
```

> 참고: 실제로는 Next.js의 `/api/*` rewrites가 서버 사이드 프록시라 브라우저 CORS는 타지 않습니다. 이 변수는 미래에 직접 호출 패턴을 쓸 때를 대비한 포석.

---

## 3. 동작 확인 체크리스트

Vercel 프론트 URL을 열고:

- [ ] 홈/튜토리얼/Flow Editor/랩 페이지 전부 로드
- [ ] Flow Editor에서 ▶ Run Pipeline (OpenAI 키 본인 입력) → 답변 나옴
- [ ] News 검색 → 실시간 기사 반환 (Render env의 NEWS_API_KEY 동작)
- [ ] LangGraph Lab → Agent 실행 → 트레이스 나옴
- [ ] **Flow Editor/LangGraph Lab 하단의 ▶ Run 버튼은 403 응답** (공개 배포에서는 의도된 동작. 로컬에서만 동작)

---

## 4. 이후 개발 흐름

```bash
# 로컬에서 수정하고 테스트 후
git add -A
git commit -m "메시지"
git push
```

- GitHub Actions가 CI 실행(`ci.yml`) — 빌드 실패 시 PR/커밋에 ❌ 표시
- Vercel이 자동으로 새 프론트 빌드·배포 (보통 1~2분)
- Render가 자동으로 새 백엔드 빌드·배포 (보통 3~5분)

push 하나로 두 서비스가 동시에 업데이트.

---

## 5. 공개 시 보안 주의

이 저장소는 공개라서 **코드는 누구나 볼 수 있습니다**. 다음을 점검하세요:

- ✅ `backend/.env` 는 `.gitignore` 대상 (이미 적용됨)
- ✅ `OPENAI_API_KEY` 는 브라우저 localStorage에만 저장, 서버 저장 X (이미 적용됨)
- ✅ `ALLOW_PYTHON_EXEC=false` on Render (위에서 설정)
- ⚠ Render에 저장된 `NEWS_API_KEY` 는 본인 외엔 접근 불가 (환경변수는 공개되지 않음)
- ⚠ Vercel 배포 URL이 인덱싱되는 것이 싫다면 Vercel 대시보드에서 **Password Protection**(유료) 또는 리포지토리를 private로 되돌리기

---

## 6. 흔한 트러블슈팅

| 증상 | 원인·해결 |
|------|-----------|
| Vercel 배포 후 `/api/*` 404 | `BACKEND_URL` env 미설정 또는 Render URL이 슬립 중. Render 헬스체크 먼저. |
| Render 배포 실패 `ModuleNotFoundError` | `pyproject.toml` 에 빠진 의존성. 로컬에서 `pip install -e ./backend` 후 import 확인하고 푸시. |
| 프론트는 뜨는데 Flow Editor의 Run만 안 됨 | 브라우저 DevTools → Network 탭에서 `/api/pipelines/run/stream` 응답 확인. 500이면 백엔드 로그(Render 대시보드 → Logs) 확인. |
| Render 콜드 스타트가 너무 길다 | 유료 플랜($7/월) 또는 외부 크론(uptimerobot 등)으로 5분마다 `/health` 호출. |
