# BACKEND_PLAN.md — 백엔드 MVP 구현 계획

> **문서 상태: v0.3 (2026-10-15) — 1단계 완료 (테스트 55개 통과), 2단계 승인 대기**
>
> - 구현 기준은 [`DATABASE.md`](./DATABASE.md), [`API.md`](./API.md), `CLAUDE.md` 8.1이다. 이 계획은 **순서와 승인 시점**만 정한다.
> - 설계 문서에 없는 기능·DB 필드·엔드포인트는 추가하지 않는다. 구현 중 설계 변경이 필요하면 먼저 보고하고 문서를 함께 고친다.
> - 패키지 설치, DB 연결·데이터 변경, Git 초기화·커밋·푸시, 배포는 **각 단계의 승인 시점에 보고한 뒤** 사용자 승인으로만 진행한다.

---

## 1. 구현 기본안 (제안)

| 항목 | 기본안 | 이유 |
| --- | --- | --- |
| 위치 | `backend/` 독립 npm 패키지 | `frontend/`(Vite 템플릿)와 분리 |
| 모듈 형식 | ESM (`"type": "module"`) | 루트 프로젝트와 동일, 최신 Node 기본 |
| Express | 5.x (설치 시 실제 버전 확인) | async 오류 자동 전달, 쿼리 파서 기본값 `simple`(중첩 객체 파싱 안 함) |
| 개발 실행 | `node --watch --env-file=.env src/server.js` | Node v24 내장 기능, `nodemon`·`dotenv` 불필요 |
| 테스트 | `node:test` + `supertest` (제안) | 테스트 러너 추가 의존성 없음 |
| 테스트 DB | **결정: `mongodb-memory-server`** (로컬, 첫 실행 시 MongoDB 바이너리 다운로드) | 운영 데이터 보호 (`CLAUDE.md` 9.1) |
| User-Agent 판별 | 정규식 기반 자체 함수 (기기 유형·봇) | 통계용 4가지 분류만 필요, 의존성 최소화 |

### 1.1 미들웨어 순서 (`src/app.js`)

```text
requestId → helmet → cors(CLIENT_ORIGIN, credentials)
→ originCheck(비-GET 전체) → session(saveUninitialized: false)
→ 라우터별 express.json(공개 16KB / 관리자 256KB) + Content-Type 검사
→ routes(/api/v1) → 404(ROUTE_NOT_FOUND) → errorHandler
```

---

## 2. 단계별 계획

### 0단계 — 사전 준비 (사용자 결정·작업)

| 항목 | 담당 | 비고 |
| --- | --- | --- |
| ~~Vite 템플릿 처리~~ | 완료 | `frontend/`로 이동 (삭제 없음) |
| ~~테스트 DB 방식 선택~~ | 완료 | `mongodb-memory-server` |
| Atlas 클러스터, DB 사용자(`portfolio` DB `readWrite`만), 네트워크 접근 목록 | 사용자 | 실제 연결 확인이 필요한 시점까지 |
| `backend/.env` 작성 (`backend/.env.example` 참고) | 사용자 | Claude는 실제 `.env`를 만들지 않음 |
| 프로젝트를 OneDrive 밖으로 옮길지 결정 | 사용자 | `.env` 클라우드 동기화 위험 |

### 1단계 — 기본 서버 및 DB 연결 (완료)

| 구분 | 내용 |
| --- | --- |
| 범위 | `GET /health`, 공통 응답·오류 형식, 404, 요청 크기·Content-Type 제한, `Origin` 검증, CORS, 보안 헤더 |
| 파일 | `package.json`, `.env.example`, `src/server.js`, `src/app.js`, `src/config/env.js`(Zod), `src/config/database.js`, `src/middleware/{requestId,originCheck,jsonBody,errorHandler,notFound,validate}.js`, `src/utils/{ApiError,response}.js`, `src/modules/health/` |
| 동작 | 환경변수 검증 실패·DB 연결 실패 시 서버 시작 중단. `sanitizeFilter`, `strictQuery` 설정. 종료 시그널에 DB 연결 정리 |
| 패키지 (승인 필요) | `express`, `mongoose`, `zod`, `helmet`, `cors` / 개발: `supertest`, `mongodb-memory-server` |
| 테스트 | 오류 형식, 404, 413, 415, `Origin` 403, 환경변수 누락 시 시작 실패 |
| 보고 시점 | ① 패키지 설치 전 ② 실제 Atlas 연결 확인 전 |
| 추가 (2026-10-15) | Windows 개발 PC에서 Node가 OS DNS를 읽지 못해 Atlas SRV 조회가 실패(`querySrv ECONNREFUSED`) → 선택 환경변수 `DNS_SERVERS` 추가 (`src/config/dns.js`). 이 PC의 `.env`에만 임시 지정하고 다른 환경의 기본값은 없음 |

### 2단계 — 관리자 인증·세션 (구현 완료, 관리자 계정 생성은 사용자 실행 대기)

| 구분 | 내용 |
| --- | --- |
| 범위 | `POST /auth/login`, `POST /auth/logout`(세션 선택), `GET /auth/me`, `PATCH /auth/password`, `requireAdmin` 미들웨어 |
| 파일 | `src/config/session.js`, `src/modules/auth/`(`admin.model.js`, routes, controller, service, validation), `src/middleware/{requireAdmin,rateLimit}.js`, `scripts/create-admin.js` |
| 동작 | 세션 ID 재발급, 유휴 2시간·절대 12시간, `passwordChangedAt` 검사, 연속 5회 실패 시 15분 잠금, IP당 15분 10회 제한, 비밀번호 변경 시 현재 세션 재발급 + 나머지 삭제 |
| 패키지 (승인 필요) | `express-session`, `connect-mongo`, `argon2`(Node v24 + Windows 설치 확인, 실패 시 `bcrypt`), `express-rate-limit` |
| 테스트 | 로그인 성공·실패, 잠금 429, 세션 없음 401, 로그아웃 멱등 204, 비밀번호 변경 후 다른 세션 무효 |
| 보고 시점 | ① 패키지 설치 전 ② `create-admin.js` 실행(DB 쓰기) 전 — 사용자가 직접 실행 |

### 3단계 — 프로젝트·기술 스택·학습 기록 CRUD (구현 완료, 프로필은 별도 단계로 분리)

> 2026-10-16: 기술·프로젝트·학습 기록 CRUD와 `scripts/sync-indexes.js` 구현, 테스트 187개 통과. 프로필(`GET /profile`, `PUT /admin/profile`)은 사용자 결정으로 이 단계에서 제외했다(3-1단계). 공개 콘텐츠 GET에 1분 120회 제한 적용. 인덱스 스크립트는 Atlas에서 실행하지 않음.

| 구분 | 내용 |
| --- | --- |
| 순서 | 기술 → 프로젝트 → 학습 기록 → 프로필 (참조 방향 순서) |
| 범위 | 공개 조회(`slug`), 관리자 CRUD(`id`), `PUT /admin/profile` |
| 파일 | `src/modules/{skills,projects,study-records,profile}/`, `src/utils/serialize.js`(응답 변환), `scripts/sync-indexes.js` |
| 동작 | 참조 ID 존재 확인(400), slug·이름 중복(409), 참조 중인 기술 삭제 409, 프로젝트 삭제 시 학습 기록 `$pull`, `publishedAt` 자동 설정, 공개 응답에서 비공개 기술 제외 |
| 이 단계의 목록 | 기본 정렬 + `page`/`limit`만 지원 (검색·필터·정렬 파라미터는 4단계) |
| 테스트 | 리소스별 CRUD, 비공개 리소스 404, 형식 오류 `id` 400·slug 404, 참조 무결성 |
| 보고 시점 | `sync-indexes.js` 실행(인덱스 생성 = DB 변경) 전 |

### 3-1단계 — 프로필 (구현 완료, 2026-10-16)

> `GET /profile`, `PUT /admin/profile`(전체 교체, 생성 201·교체 200), `profiles.singletonKey_unique` 인덱스 정의 추가(Atlas 미생성). 단일 문서 보장은 이 인덱스에 의존하므로 운영에서 첫 `PUT` 전에 `npm run db:sync-indexes` 실행 필요. 테스트 251개 통과.

### 4단계 — 검색 및 페이지네이션 (구현 완료)

> 2026-10-16: `src/utils/listQuery.js` 공통 헬퍼, 프로젝트·학습 기록·기술 스택 목록의 검색·필터·정렬 구현. 새 인덱스 없음. 테스트 223개 통과.

| 구분 | 내용 |
| --- | --- |
| 범위 | `API.md` 5장 전체: `q`, 필터, `sort` 허용 목록, 정의되지 않은 파라미터 400, 날짜 범위 |
| 파일 | `src/utils/listQuery.js`(Zod 스키마 생성, 정렬 변환, 정규식 이스케이프, 페이지 메타) — 리소스별 허용 값 표만 각 모듈에 둠 |
| 테스트 | 정렬 안정성(`_id` 보조 정렬), 마지막 페이지 초과 시 빈 목록, 특수문자 검색어, `?featured[$ne]=x` 400 |

### 5단계 — 문의 폼 (구현 완료, 2026-10-16)

> 공개 2개·관리자 4개 API, 허니팟·서명 토큰·빈도 제한(24시간 10회 → 10분 3회 순서)·URL 판정·24시간 중복 방지·조용한 거부(202), 180일 TTL. 문의 인덱스 4개 정의 추가(인덱스 정의 17개, Atlas 미생성). 기존 규칙대로 controller 파일 없이 routes에서 처리. 테스트 295개 통과.

| 구분 | 내용 |
| --- | --- |
| 범위 | `GET /inquiries/form-token`, `POST /inquiries`, `/admin/inquiries` 4개 |
| 파일 | `src/modules/inquiries/`(model, formToken, spamGuard, routes, controller, service, validation) |
| 동작 | 허니팟·3초 미만·24시간 내 중복은 202로 조용히 무시, URL 4개 이상 400, IP 10분 3회·24시간 10회, `expiresAt` = 접수 + 180일(TTL), `consentVersion` 코드 상수 |
| 테스트 | 각 스팸 규칙, 토큰 만료·위조, 저장 필드에 IP·UA가 없는지 |

### 6단계 — 방문 통계 (구현 완료, 2026-10-16)

> `POST /visits`, `GET /admin/stats/visits`, 일별 HMAC `visitorHash`, 30분 `dedupKey`, 90일 TTL, `visit_daily_stats` 집계(KST 자정 후 5분 마감, 보관 기간 안 0인 날 저장), 1시간 스케줄러 + 조회 시 보정. 방문 인덱스 5개 정의 추가(인덱스 정의 22개, Atlas 미생성). controller 파일 없이 routes에서 처리. 테스트 327개 통과.

| 구분 | 내용 |
| --- | --- |
| 범위 | `POST /visits`, `GET /admin/stats/visits` |
| 파일 | `src/modules/visits/`(`visitEvent.model.js`, `visitDailyStat.model.js`, `hash.js`, `userAgent.js`, `rollup.js`, routes, controller, service) |
| 동작 | 경로 정규화, 외부 referrer 호스트만 저장, `visitorHash`·`dedupKey`(30분 구간, unique), 관리자·봇·prefetch 제외, 항상 204, 1시간 주기 + 조회 시 보정 집계, 90일 TTL |
| 테스트 | 중복 제거, 날짜 경계(KST), 빈 날짜 0 채우기, 90일 초과 범위의 `approximateTopLists` |

---

## 3. 승인·보고 시점 요약

| 시점 | 필요한 승인 | 실행 주체 |
| --- | --- | --- |
| ~~1단계 테스트 실행 전~~ | 1단계 패키지 설치 — 완료 (2026-10-15) | 사용자 승인 → Claude |
| 1단계 실제 DB 연결 확인 | `backend/.env` 준비 확인, Atlas 연결 테스트 실행 | 사용자 준비 → Claude 실행 |
| 2단계 시작 전 | 인증 패키지 설치 (`argon2` 설치 결과 보고) | Claude |
| 2단계 완료 후 | 관리자 계정 생성 스크립트 실행 | **사용자 직접 실행** (비밀번호 입력) |
| 3단계 완료 후 | 인덱스 동기화 스크립트 실행 | 사용자 승인 후 |
| 언제든 | Git 초기화·커밋·푸시 | 사용자 요청 시에만 |
| MVP 이후 | 배포, 배포 도메인 결정(U-01) | 별도 계획 |

### 3.1 보안 후속 조치 (미해결)

| 날짜 | 내용 | 상태 |
| --- | --- | --- |
| 2026-10-15 | Atlas 개발용 DB 사용자의 실제 비밀번호가 포함된 연결 문자열이 `backend/.env.example`(커밋 대상 파일)에 입력되었고, 같은 내용이 작업 대화에도 노출되었다. `.env.example`은 예시 형식으로 복구했다 (Git 저장소 생성 전이라 커밋 이력은 없음). OneDrive 버전 기록에는 이전 내용이 남아 있을 수 있다. | 파일 정리 완료 |
| 2026-10-15 | **해당 DB 사용자의 비밀번호는 교체하지 않았다** (사용자 결정). 노출된 비밀번호가 현재 `backend/.env`에서 그대로 사용 중이다. | **사용자 결정: 교체하지 않음 (2026-10-16, 위험 수용)** — 이후 작업 목록에서 제외. 개발용 DB 사용자는 `portfolio_dev`의 `readWrite` 권한과 IP 접근 목록으로만 제한된 상태를 유지 |

---

## 4. 이번 MVP에서 구현하지 않는 것

- 프론트엔드 화면·컴포넌트, 다크 모드 UI (클라이언트 전용이라 백엔드 작업 없음)
- 이미지 업로드, 문의 이메일 알림, 2단계 인증, Atlas Search, CAPTCHA (`DESIGN_REVIEW.md` U-11, U-17~U-19)
- 설계 문서에 없는 필드·엔드포인트

---

## 5. 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-10-15 | v0.1 | 최초 작성 |
| 2026-10-15 | v0.2 | 템플릿 이동, 테스트 DB 결정, 1단계 파일 작성 |
| 2026-10-15 | v0.3 | 1단계 패키지 설치, 전체 테스트 55개 통과 |
| 2026-10-15 | v0.4 | 선택 환경변수 `DNS_SERVERS` 추가, Atlas 개발 DB 연결 확인 |
| 2026-10-16 | v1.1 | 방문 집계 시작일을 가장 이른 원본 이벤트 날짜로 변경 (빈 DB에서는 컬렉션·문서 생성 안 함), 테스트 332개 |
| 2026-10-16 | v1.0 | 6단계 방문 통계 구현, 인덱스 정의 22개 — 백엔드 MVP 기능 구현 완료 |
| 2026-10-16 | v0.9 | 5단계 문의 폼 구현, 인덱스 정의 17개 |
| 2026-10-16 | v0.8 | 3-1단계 프로필 API 구현, 인덱스 정의 13개 |
| 2026-10-16 | v0.7 | 4단계 구현 (검색·필터·정렬), 3단계 테스트의 400 검증 예시를 여전히 잘못된 파라미터로 교체 |
| 2026-10-16 | v0.6 | 3단계 구현 (기술·프로젝트·학습 기록 CRUD, 인덱스 동기화 스크립트), 프로필은 별도 단계로 분리 |
| 2026-10-15 | v0.5 | 2단계 구현: 세션·로그인 제한·비밀번호 변경, 테스트 106개 통과. 서버의 자동 인덱스 생성 끔 |
