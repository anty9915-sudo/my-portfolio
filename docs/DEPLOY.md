# DEPLOY.md — 배포 기준

> **문서 상태: v0.1 (2026-10-18) — 첫 배포 구성.** 백엔드 코드는 바꾸지 않고 설정 파일만 추가했다.

## 1. 구성

```text
방문자 브라우저 ──▶ Vercel (frontend/, 정적 파일)
                     └─ /api/* 요청을 그대로 전달 (rewrite 프록시)
                          ──▶ Render (backend/, Express API) ──▶ MongoDB Atlas
```

- 브라우저 입장에서는 화면과 API가 **같은 주소(Vercel)**라서 관리자 세션 쿠키(`__Host-sid`, `SameSite=Lax`, `Secure`)와 Origin 검증이 그대로 동작한다 (`DESIGN_REVIEW.md` U-01: 같은 출처 구성).
- Atlas에는 Render 서버만 접속한다. 방문자·발표 장소의 IP는 상관없다.

| 파일 | 역할 |
| --- | --- |
| `render.yaml` | Render Blueprint. 서비스 이름 `my-portfolio-api`, `backend/`를 `npm ci --omit=dev` → `npm start`로 실행 |
| `frontend/vercel.json` | `/api/*` → `https://my-portfolio-api-d02n.onrender.com/api/*` 프록시, 나머지 경로는 `index.html`(SPA) |

> Render는 `my-portfolio-api`가 이미 사용 중이라 `my-portfolio-api-d02n.onrender.com`을 배정했다. Render 주소가 바뀌면 `frontend/vercel.json`도 같이 바꿔야 한다.
>
> 운영 주소 (2026-10-18): 사이트 `https://my-portfolio-delta-smoky-21.vercel.app`, API `https://my-portfolio-api-d02n.onrender.com`

## 2. 환경변수 (Render)

| 변수 | 값 | 입력 방법 |
| --- | --- | --- |
| `NODE_ENV` | `production` | Blueprint에 고정 |
| `NODE_VERSION` | `24.16.0` | Blueprint에 고정 |
| `TRUST_PROXY` | `2` | Blueprint에 고정 (Vercel 프록시 + Render 프록시) |
| `SESSION_SECRET`, `VISIT_HASH_SECRET`, `FORM_TOKEN_SECRET` | 무작위 | Render가 자동 생성 (로컬 `.env`와 다른 값) |
| `MONGODB_URI` | Atlas 연결 문자열 (DB 이름 포함) | Render 화면에서 직접 입력 |
| `CLIENT_ORIGIN` | Vercel 주소, 예: `https://my-portfolio-xxxx.vercel.app` (끝 `/` 없음) | Vercel 배포 후 입력 |
| `PORT` | — | Render가 자동 지정 |

`ADMIN_EMAIL`, `DNS_SERVERS`는 운영 서버에 필요 없다.

## 3. 순서

1. **Atlas:** DB 사용자 비밀번호 교체 → Network Access에 `0.0.0.0/0` 추가 (Render 무료 플랜은 고정 IP가 없음). 로컬 `backend/.env`의 `MONGODB_URI`도 새 비밀번호로 바꾼다.
2. **Render:** New → Blueprint → GitHub 저장소 `my-portfolio` 선택 → `MONGODB_URI` 입력 (`CLIENT_ORIGIN`은 임시로 `https://example.com`) → 배포 → `https://<Render 주소>/api/v1/health`가 `{"status":"ok","database":"up"}`인지 확인.
3. **Vercel:** Add New → Project → 저장소 `my-portfolio` → **Root Directory `frontend`** (Framework: Vite) → Deploy → 배정된 주소 확인.
4. **Render:** `CLIENT_ORIGIN`을 Vercel 주소로 바꾸고 저장(자동 재시작).
5. **확인:** Vercel 주소에서 메인 화면, `/api/v1/health`, 관리자 로그인, 문의 전송, 관리자 문의·통계 화면.

## 4. 알려진 제약

- Render 무료 서버는 15분간 요청이 없으면 잠들고, 다음 첫 요청에 30초~1분이 걸린다. 발표·공유 전에 한 번 열어 둔다.
- 요청 빈도 제한은 메모리 저장소라 Render가 재시작하면 초기화된다 (`API.md` 6장).
- `0.0.0.0/0` 허용은 DB 비밀번호에만 의존하므로, 비밀번호를 강하게 유지하고 노출되면 즉시 교체한다.
