# API.md — REST API 설계 (초안)

> **문서 상태: 초안 v0.2 (2026-10-15) — 기본안 반영, 구현 기준으로 사용**
>
> - 이 문서는 `CLAUDE.md` 6장의 API 규약을 구체화한다. 사용자 승인 전까지 모든 계약은 **제안**이다.
> - 저장 구조와 검증 규칙의 원본은 [`DATABASE.md`](./DATABASE.md), 결정 근거와 미정 사항은 [`DESIGN_REVIEW.md`](./DESIGN_REVIEW.md)에 있다.
> - 엔드포인트의 인증 요구는 표의 **인증** 열로 표시한다: `공개` / `세션 선택`(세션이 있으면 사용, 없어도 성공) / `🔒 관리자`.

---

## 1. 기본 규칙

| 항목 | 규칙 | 상태 |
| --- | --- | --- |
| Base URL | `/api/v1` | `CLAUDE.md` 기준 |
| 데이터 형식 | 요청·응답 모두 `application/json; charset=utf-8` | 확정 방향 |
| 요청 Content-Type | 본문이 있는 요청은 `Content-Type: application/json` 필수. 아니면 415 | 제안 |
| 요청 크기 제한 | 공개 API 16KB, 관리자 API 256KB. 초과 시 413 | 제안 |
| URL | 소문자 kebab-case, 복수형 명사 (예: `/study-records`) | `CLAUDE.md` 기준 |
| 필드 이름 | camelCase | `CLAUDE.md` 기준 |
| ID | MongoDB `_id`를 문자열 `id` 필드로 반환. `_id`, `__v`는 응답에 포함하지 않음 | 제안 |
| 날짜 | ISO-8601 UTC 문자열 (예: `2026-10-15T03:00:00.000Z`). 날짜만 받는 파라미터는 `YYYY-MM-DD`(KST) | 제안 |
| 공개 상세 조회 키 | `slug` (예: `/projects/my-portfolio`). 형식에 맞지 않는 slug는 404 `NOT_FOUND` | 기본안 |
| 관리자 조회 키 | `id` (ObjectId 문자열) | 제안 |
| `null` 처리 | 값이 없는 선택 필드는 생략하지 않고 `null`로 반환 | 제안 |
| CORS | `CLIENT_ORIGIN`에 지정한 출처만 허용, `credentials: true` | 제안 |

---

## 2. 공통 응답 형식

### 2.1 단건 성공

```json
{
  "success": true,
  "data": { "id": "671e1f...", "title": "..." }
}
```

### 2.2 목록 성공

```json
{
  "success": true,
  "data": [ { "id": "..." } ],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalItems": 23,
    "totalPages": 3,
    "hasNext": true
  }
}
```

- 페이지네이션이 없는 목록(기술 목록)은 `meta: { "totalItems": n }`만 반환한다.

### 2.3 본문 없는 성공

- `204 No Content` — 삭제, 로그아웃, 방문 기록, 비밀번호 변경. 응답 본문 없음.

### 2.4 오류

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 값을 확인해 주세요.",
    "details": [
      { "field": "title", "reason": "1~100자로 입력해 주세요." },
      { "field": "githubUrl", "reason": "https URL만 허용됩니다." }
    ],
    "requestId": "b1c2d3e4"
  }
}
```

- `details`는 입력 검증 오류(`VALIDATION_ERROR`)에만 포함한다. 그 외에는 생략한다.
- `requestId`는 서버 로그와 대조하기 위한 값이다. 응답 헤더 `X-Request-Id`에도 같은 값을 넣는다 (제안).
- 스택 트레이스, DB 오류 원문, 파일 경로, 쿼리 내용은 절대 포함하지 않는다 (`CLAUDE.md` 6.4).

---

## 3. 공통 오류 규약

| HTTP | `error.code` | 사용 상황 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 본문·쿼리 파라미터 검증 실패, 허용되지 않은 필드·파라미터, 잘못된 정렬 값 |
| 400 | `INVALID_ID` | ObjectId 형식이 아닌 `:id` |
| 400 | `INVALID_JSON` | JSON 파싱 실패 |
| 401 | `UNAUTHENTICATED` | 로그인이 필요한 API에 세션 없음 또는 세션 만료 |
| 401 | `INVALID_CREDENTIALS` | 이메일 또는 비밀번호 불일치 (어느 쪽이 틀렸는지 구분하지 않음) |
| 403 | `FORBIDDEN` | 인증은 되었으나 권한 없음, 또는 `Origin` 검증 실패(CSRF 방어) |
| 404 | `NOT_FOUND` | 리소스 없음. **공개 API에서 비공개 리소스 요청 시에도 404** (존재 여부 노출 방지) |
| 404 | `ROUTE_NOT_FOUND` | 정의되지 않은 경로 |
| 409 | `DUPLICATE_KEY` | `slug`, 기술 이름 등 unique 값 중복 |
| 409 | `RESOURCE_IN_USE` | 다른 문서가 참조 중인 기술 삭제 |
| 413 | `PAYLOAD_TOO_LARGE` | 요청 크기 제한 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON이 아닌 요청 본문 |
| 429 | `RATE_LIMITED` | 요청 빈도 제한 초과. `Retry-After` 헤더 포함 |
| 429 | `TOO_MANY_ATTEMPTS` | 로그인 연속 실패로 계정 일시 잠금. `Retry-After` 헤더 포함 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 서버 오류. 메시지는 일반 문구만 |
| 503 | `SERVICE_UNAVAILABLE` | DB 연결 불가 (헬스 체크 등) |

> 성공 코드 202(문의 접수)와 오류 코드 413, 415, 503은 `CLAUDE.md` 6.3에도 반영되어 있다.

---

## 4. 인증·인가

자세한 선택 이유는 `DESIGN_REVIEW.md` 1장 참고. 아래는 **제안**이다.

| 항목 | 규칙 |
| --- | --- |
| 방식 | 서버 세션 + HttpOnly 쿠키 (세션은 MongoDB `sessions` 컬렉션에 저장, `express-session` + `connect-mongo`) |
| 비밀번호 해시 | Argon2id (설치 실패 시 bcrypt) |
| 쿠키 | 운영: `__Host-sid`, `HttpOnly; Secure; SameSite=Lax; Path=/` / 개발: `sid`, `Secure` 제외 |
| 세션 만료 | 유휴 2시간(요청마다 연장), 로그인 후 최대 12시간 |
| 로그인 시 | 세션 ID 재발급 (세션 고정 공격 방지) |
| 로그아웃 시 | 서버 세션 삭제 + 쿠키 만료 |
| 비밀번호 변경 시 | 현재 세션은 ID를 재발급하고 `loginAt`을 갱신해 유지, 나머지 세션은 모두 삭제 |
| 관리자 API 표시 | 이 문서에서 `🔒 관리자`로 표시한 모든 엔드포인트: `/api/v1/admin/**`, `/auth/me`, `/auth/password` |
| 세션 선택 | `/auth/logout` — 인증 미들웨어를 거치지 않고, 세션이 없어도 204 (멱등) |
| 인증 실패 | 세션 없음·만료 → 401 `UNAUTHENTICATED` |
| CSRF 방어 | ① `SameSite=Lax` 쿠키, ② **`/api/v1`의 모든 비-GET 요청**(`POST`/`PUT`/`PATCH`/`DELETE` — 로그인·로그아웃·문의·방문 기록 포함)은 `Origin` 헤더가 `CLIENT_ORIGIN`과 일치해야 함. 불일치 또는 헤더 누락 → 403 `FORBIDDEN`, ③ 본문이 있는 요청은 JSON Content-Type 강제 (로그아웃처럼 본문 없는 요청은 제외). CSRF 토큰은 1단계에서 사용하지 않음 |
| 권한 | 1단계는 `admin` 역할 하나. 로그인한 관리자는 모든 관리자 API 사용 가능 |

---

## 5. 목록 조회 규칙 (검색·필터·정렬·페이지네이션)

### 5.1 페이지네이션 (제안: page/limit 방식)

| 파라미터 | 형식 | 기본값 | 제약 |
| --- | --- | --- | --- |
| `page` | 정수 | `1` | 1 이상 |
| `limit` | 정수 | `10` | 1~50 |

- 마지막 페이지를 넘는 `page`는 오류가 아니라 빈 `data`와 정상 `meta`를 반환한다.
- 선택 이유: 데이터가 적고, 페이지 번호 UI와 전체 개수 표시가 필요하다. 커서 방식은 대안으로 남긴다 (`DESIGN_REVIEW.md` 6장).

### 5.2 정렬

- 형식: `sort=<필드>` 또는 `sort=-<필드>`(내림차순). 쉼표로 최대 2개 (예: `sort=-startedAt,title`).
- 리소스별 **허용 목록에 있는 필드만** 사용할 수 있다. 그 외는 400 `VALIDATION_ERROR`.
- 서버는 항상 `_id`를 마지막 정렬 기준으로 추가해 순서를 안정화한다. `sort`를 지정하지 않으면 리소스의 기본 정렬(5.5)을 그대로 쓰고, `sort`를 지정하면 `_id`는 **마지막으로 지정한 필드의 방향**을 따른다 (예: `sort=-title` → `title ↓, _id ↓`).
- 문자열 정렬은 MongoDB 기본(코드 포인트) 순서다. 한글은 가나다순, 영문은 대문자가 소문자보다 앞선다.
- 검색어(`q`)가 있어도 관련도 정렬은 하지 않고 지정한 정렬을 따른다 (1단계).

### 5.3 검색

| 항목 | 규칙 |
| --- | --- |
| 파라미터 | `q` |
| 길이 | 앞뒤 공백 제거 후 2~50자 |
| 방식 | 대소문자 무시 부분 일치. 정규식 특수문자는 서버에서 이스케이프 |
| 대상 필드 | 리소스별 표 참조 |
| 결합 | 검색어와 필터는 AND 조건 |

### 5.4 필터 공통 규칙

- 필터 값은 **단일 값**만 받는다 (1단계). 다중 값(`skill=react,nodejs`) 지원은 미정.
- 불리언 필터는 `true` / `false` 문자열만 허용한다.
- 날짜 필터 `from`, `to`는 `YYYY-MM-DD`(KST)이며 양 끝을 포함한다: `from`은 그날 KST 00:00 이상, `to`는 그날 KST 24:00 미만. `from > to`이면 400. 날짜만 입력해 저장한 값(UTC 자정 = KST 09:00)은 같은 KST 날짜 범위에 속한다.
- 존재하지 않는 `skill` slug로 필터하면 404가 아니라 빈 목록(200)을 반환한다. **공개 API는 공개 기술만 찾으므로** 비공개 기술의 slug도 같은 빈 목록이 된다 (존재·연결 관계 비노출). 관리자 API는 모든 기술로 필터할 수 있다.
- 빈 값(`?tag=`)이나 허용되지 않은 값은 400 `VALIDATION_ERROR`.
- **정의되지 않은 쿼리 파라미터는 400**으로 거부한다 (오타 조기 발견, 제안).
- 쿼리 파라미터는 문자열만 허용한다. `?featured[$ne]=x` 같은 객체·배열 형태는 400 (NoSQL 인젝션 방지).

### 5.5 리소스별 허용 값

| 리소스 | 검색 대상 (`q`) | 필터 | 정렬 허용 필드 | 기본 정렬 |
| --- | --- | --- | --- | --- |
| 공개 `/projects` | `title`, `summary`, `tags` | `skill`(slug), `tag`, `featured` | `sortOrder`, `startedAt`, `title`, `publishedAt` | `sortOrder,-startedAt` |
| 관리자 `/admin/projects` | 위와 동일 | 위 + `visibility` | 위 + `createdAt`, `updatedAt` | `-updatedAt` |
| 공개 `/skills` | — | `category`, `status` | — (고정) | `category`, `sortOrder`, `name` |
| 관리자 `/admin/skills` | `name` | 위 + `visibility` | `name`, `sortOrder`, `updatedAt` | `category`, `sortOrder`, `name` |
| 공개 `/study-records` | `title`, `summary`, `tags` | `category`, `skill`(slug), `tag`, `from`, `to` | `learnedAt`, `title` | `-learnedAt` |
| 관리자 `/admin/study-records` | 위와 동일 | 위 + `visibility` | 위 + `createdAt`, `updatedAt` | `-updatedAt` |
| 관리자 `/admin/inquiries` | `name`, `email`, `subject` | `status`, `from`, `to` | `createdAt` | `-createdAt` |

- 기술 목록(공개 `/skills`, 관리자 `/admin/skills` 모두)은 최대 200건 수준으로 제한되므로 **페이지네이션 없이 전체를 반환**한다 (예외, 제안). `page`, `limit`을 보내면 400.

---

## 6. 요청 빈도 제한 (제안)

| 대상 | 제한 | 키 | 초과 시 |
| --- | --- | --- | --- |
| `POST /auth/login` | 15분에 10회 | IP | 429 `RATE_LIMITED` |
| 로그인 연속 실패 | 5회 실패 시 15분 잠금 | 관리자 계정 | 429 `TOO_MANY_ATTEMPTS` |
| `GET /inquiries/form-token` | 10분에 20회 | IP | 429 |
| `POST /inquiries` | 10분에 3회, 24시간에 10회 | IP | 429 |
| `POST /visits` | 1분에 60회 | IP | 429 |
| 그 외 공개 `GET` | 1분에 120회 | IP | 429 |

- 1단계는 단일 서버 인스턴스를 가정하고 메모리 저장소를 사용한다. 다중 인스턴스 배포 시 공유 저장소가 필요하다 (미정).
- **메모리 저장소의 한계:** 서버를 다시 시작하면 모든 카운터가 초기화된다(예: 문의 24시간 10회 제한도 재시작 시 0부터 다시 센다). 서버를 여러 대로 늘리면 인스턴스마다 따로 세므로 실제 허용량이 인스턴스 수만큼 늘어난다.
- `POST /inquiries`는 **24시간 제한을 먼저, 10분 제한을 나중에** 적용한다. 10분 제한에 걸린 시도도 24시간 카운트에 포함하기 위해서다. 검증 실패(400)와 조용한 거부(202)도 모두 시도로 센다.
- 프록시(호스팅 플랫폼) 뒤에서는 Express `trust proxy`를 정확히 설정해야 실제 클라이언트 IP로 제한할 수 있다.
- 제한용 IP는 메모리에만 존재하며 DB에 저장하지 않는다.

---

## 7. 엔드포인트 요약

| 구분 | 메서드 | 경로 | 인증 | 설명 | 성공 코드 |
| --- | --- | --- | --- | --- | --- |
| 시스템 | GET | `/health` | 공개 | 상태 확인 | 200 / 503 |
| 프로필 | GET | `/profile` | 공개 | 프로필 조회 | 200 |
| 프로젝트 | GET | `/projects` | 공개 | 공개 프로젝트 목록 | 200 |
| 프로젝트 | GET | `/projects/:slug` | 공개 | 공개 프로젝트 상세 | 200 |
| 기술 | GET | `/skills` | 공개 | 공개 기술 목록 (전체) | 200 |
| 학습 기록 | GET | `/study-records` | 공개 | 공개 학습 기록 목록 | 200 |
| 학습 기록 | GET | `/study-records/:slug` | 공개 | 공개 학습 기록 상세 | 200 |
| 문의 | GET | `/inquiries/form-token` | 공개 | 문의 폼 토큰 발급 | 200 |
| 문의 | POST | `/inquiries` | 공개 | 문의 접수 | 202 |
| 방문 | POST | `/visits` | 공개 | 페이지뷰 기록 | 204 |
| 인증 | POST | `/auth/login` | 공개 | 관리자 로그인 | 200 |
| 인증 | POST | `/auth/logout` | 세션 선택 | 로그아웃 | 204 |
| 인증 | GET | `/auth/me` | 🔒 관리자 | 현재 로그인 관리자 정보 | 200 |
| 인증 | PATCH | `/auth/password` | 🔒 관리자 | 비밀번호 변경 | 204 |
| 프로필 | PUT | `/admin/profile` | 🔒 관리자 | 프로필 생성·전체 수정 | 201 / 200 |
| 프로젝트 | GET | `/admin/projects` | 🔒 관리자 | 전체 프로젝트 목록 (비공개 포함) | 200 |
| 프로젝트 | GET | `/admin/projects/:id` | 🔒 관리자 | 프로젝트 상세 | 200 |
| 프로젝트 | POST | `/admin/projects` | 🔒 관리자 | 프로젝트 생성 | 201 |
| 프로젝트 | PATCH | `/admin/projects/:id` | 🔒 관리자 | 프로젝트 부분 수정 | 200 |
| 프로젝트 | DELETE | `/admin/projects/:id` | 🔒 관리자 | 프로젝트 삭제 | 204 |
| 기술 | GET | `/admin/skills` | 🔒 관리자 | 전체 기술 목록 | 200 |
| 기술 | GET | `/admin/skills/:id` | 🔒 관리자 | 기술 상세 (참조 개수 포함) | 200 |
| 기술 | POST | `/admin/skills` | 🔒 관리자 | 기술 생성 | 201 |
| 기술 | PATCH | `/admin/skills/:id` | 🔒 관리자 | 기술 부분 수정 | 200 |
| 기술 | DELETE | `/admin/skills/:id` | 🔒 관리자 | 기술 삭제 (참조 중이면 409) | 204 |
| 학습 기록 | GET | `/admin/study-records` | 🔒 관리자 | 전체 학습 기록 목록 | 200 |
| 학습 기록 | GET | `/admin/study-records/:id` | 🔒 관리자 | 학습 기록 상세 | 200 |
| 학습 기록 | POST | `/admin/study-records` | 🔒 관리자 | 학습 기록 생성 | 201 |
| 학습 기록 | PATCH | `/admin/study-records/:id` | 🔒 관리자 | 학습 기록 부분 수정 | 200 |
| 학습 기록 | DELETE | `/admin/study-records/:id` | 🔒 관리자 | 학습 기록 삭제 | 204 |
| 문의 | GET | `/admin/inquiries` | 🔒 관리자 | 문의 목록 | 200 |
| 문의 | GET | `/admin/inquiries/:id` | 🔒 관리자 | 문의 상세 | 200 |
| 문의 | PATCH | `/admin/inquiries/:id` | 🔒 관리자 | 상태·메모 수정 | 200 |
| 문의 | DELETE | `/admin/inquiries/:id` | 🔒 관리자 | 문의 즉시 삭제 | 204 |
| 통계 | GET | `/admin/stats/visits` | 🔒 관리자 | 방문 통계 대시보드 데이터 | 200 |

> 모든 경로 앞에 `/api/v1`이 붙는다.

---

## 8. 공개 API 상세

### 8.1 `GET /health` — 공개

```json
// 200
{ "success": true, "data": { "status": "ok", "database": "up" } }
```

- DB 연결이 끊겼으면 503 `SERVICE_UNAVAILABLE`. 버전, 호스트명, 연결 문자열 등은 반환하지 않는다.

### 8.2 `GET /profile` — 공개

```json
// 200
{
  "success": true,
  "data": {
    "name": "홍길동",
    "headline": "웹 개발과 웹 보안을 공부하는 개발자",
    "bio": "## 소개\n...",
    "goals": ["안전한 웹 서비스 설계"],
    "email": null,
    "avatarUrl": null,
    "resumeUrl": null,
    "links": [
      { "type": "github", "label": "GitHub", "url": "https://github.com/example" }
    ],
    "updatedAt": "2026-10-15T03:00:00.000Z"
  }
}
```

- 프로필 문서가 아직 없으면 404 `NOT_FOUND`.
- 쿼리 파라미터는 받지 않는다 (알 수 없는 파라미터는 400). 공개 GET 빈도 제한(1분 120회)을 적용한다.

### 8.3 `GET /projects` — 공개

```http
GET /api/v1/projects?skill=nodejs&featured=true&sort=-startedAt&page=1&limit=10
```

```json
// 200
{
  "success": true,
  "data": [
    {
      "id": "671e1f2a9b1e8a0012345678",
      "slug": "developer-portfolio",
      "title": "개발자 포트폴리오",
      "summary": "Express와 MongoDB로 만든 개인 포트폴리오",
      "startedAt": "2026-09-01T00:00:00.000Z",
      "endedAt": null,
      "featured": true,
      "thumbnailUrl": null,
      "tags": ["portfolio"],
      "skills": [
        { "id": "671e1f...", "name": "Node.js", "slug": "nodejs", "category": "backend" }
      ],
      "publishedAt": "2026-10-15T03:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "totalItems": 1, "totalPages": 1, "hasNext": false }
}
```

- 목록에는 `description`, `highlights` 등 긴 필드를 포함하지 않는다.
- `skills`에는 공개된 기술만 포함된다.

### 8.4 `GET /projects/:slug` — 공개

```json
// 200
{
  "success": true,
  "data": {
    "id": "671e1f2a9b1e8a0012345678",
    "slug": "developer-portfolio",
    "title": "개발자 포트폴리오",
    "summary": "Express와 MongoDB로 만든 개인 포트폴리오",
    "description": "## 개요\n...",
    "role": "백엔드 설계 및 구현",
    "teamSize": 1,
    "highlights": ["관리자 세션 인증 구현"],
    "startedAt": "2026-09-01T00:00:00.000Z",
    "endedAt": null,
    "skills": [ { "id": "671e1f...", "name": "Node.js", "slug": "nodejs", "category": "backend" } ],
    "tags": ["portfolio"],
    "githubUrl": "https://github.com/example/portfolio",
    "demoUrl": null,
    "thumbnailUrl": null,
    "featured": true,
    "relatedStudyRecords": [
      { "id": "671e20...", "slug": "express-session-store", "title": "세션 저장소 비교", "learnedAt": "2026-09-20T00:00:00.000Z" }
    ],
    "publishedAt": "2026-10-15T03:00:00.000Z",
    "updatedAt": "2026-10-15T03:00:00.000Z"
  }
}
```

- 비공개, 존재하지 않는, 또는 형식에 맞지 않는 slug → 404 `NOT_FOUND`.
- `relatedStudyRecords`는 공개된 학습 기록 최대 5개, `learnedAt` 내림차순.

### 8.5 `GET /skills` — 공개

```http
GET /api/v1/skills?category=backend
```

```json
// 200
{
  "success": true,
  "data": [
    {
      "id": "671e1f...",
      "name": "Node.js",
      "slug": "nodejs",
      "category": "backend",
      "status": "applied",
      "description": null,
      "iconKey": "nodejs"
    }
  ],
  "meta": { "totalItems": 1 }
}
```

### 8.6 `GET /study-records` — 공개

```http
GET /api/v1/study-records?q=세션&category=troubleshooting&from=2026-01-01&to=2026-10-15&page=1&limit=10
```

- 응답 항목: `id`, `slug`, `title`, `category`, `summary`, `tags`, `skills`, `learnedAt`, `publishedAt`. `content`는 제외.
- 응답 구조는 8.3과 동일 (`data` + `meta`).

### 8.7 `GET /study-records/:slug` — 공개

- 목록 항목 + `content`, `relatedProjects`(공개된 관련 프로젝트의 `id`, `slug`, `title`), `updatedAt`.
- 비공개, 없음, 형식 오류 slug → 404 `NOT_FOUND`.

### 8.8 `GET /inquiries/form-token` — 공개

문의 폼을 화면에 표시할 때 발급받는다. 봇의 즉시 제출을 막기 위한 서명 토큰이다.

```json
// 200
{
  "success": true,
  "data": {
    "formToken": "eyJ0IjoxNzI5...signature",
    "consentVersion": "2026-10-01",
    "expiresAt": "2026-10-15T04:00:00.000Z"
  }
}
```

- 토큰은 서버 비밀키로 서명한 발급 시각을 담는다. DB에 저장하지 않는다.
- 제출 시 발급 후 **3초 이상, 1시간 이내**여야 유효하다.
- `consentVersion`은 현재 개인정보 수집·이용 동의 문구의 버전이며, 서버 코드 상수(`src/modules/inquiries/consent.js`, 현재 `2026-10-01`)로 관리한다. **실제 동의 문구를 확정·변경할 때 이 상수도 함께 갱신해야 한다.**
- 토큰 형식: `base64url(JSON { t: 발급 시각, n: 무작위 값 })` + `.` + `base64url(HMAC-SHA256(FORM_TOKEN_SECRET, 앞부분))`. 1시간 안에는 같은 토큰을 다시 쓸 수 있으며(DB 미저장) 빈도 제한이 이를 보완한다.
- 응답에 `Cache-Control: no-store`. 쿼리 파라미터는 받지 않는다 (400). IP당 10분 20회.

### 8.9 `POST /inquiries` — 공개

```json
// 요청
{
  "name": "김방문",
  "email": "visitor@example.com",
  "subject": "협업 문의",
  "message": "포트폴리오 잘 봤습니다. 프로젝트 관련해 이야기 나누고 싶습니다.",
  "consent": true,
  "consentVersion": "2026-10-01",
  "formToken": "eyJ0IjoxNzI5...signature",
  "website": ""
}
```

```json
// 202
{ "success": true, "data": { "received": true } }
```

| 검사 | 실패 시 응답 |
| --- | --- |
| 필드 검증 (`DATABASE.md` 4.6 규칙), `consent !== true`, `consentVersion` 불일치 | 400 `VALIDATION_ERROR` |
| `formToken` 서명 불일치·만료 | 400 `VALIDATION_ERROR` (`field: "formToken"`) — 화면에서 토큰 재발급 후 재시도 |
| 허니팟 `website`에 값이 있음 | **202 (정상 응답처럼 보이지만 저장하지 않음)** |
| `formToken` 발급 후 3초 미만 제출 | **202 (저장하지 않음)** |
| 24시간 내 같은 `contentHash` 존재 | **202 (새로 저장하지 않음)** |
| 메시지 내 URL 4개 이상 | 400 `VALIDATION_ERROR` |
| 빈도 제한 초과 | 429 `RATE_LIMITED` |

- 응답에 생성된 문의 ID를 포함하지 않는다. 봇이 차단 여부를 구분하지 못하도록 성공·조용한 거부의 응답을 동일하게 한다.
- `website`는 화면에 보이지 않는 허니팟 필드이며 저장하지 않는다. 생략·`null`·빈 문자열이 아니면(공백 포함) "값이 있음"으로 본다.
- **검사 순서:** (전역) Origin·Content-Type·본문 크기 → 빈도 제한(429) → 허니팟(202) → 필드·동의 검증(400) → 토큰 서명·형식·만료(400) → 발급 후 3초 미만(202) → 24시간 내 중복(202) → 저장(202). 허니팟을 필드 검증보다 먼저 확인하므로, 허니팟이 채워진 요청은 다른 필드가 틀려도 202다.
- **URL 판정:** `message`에서 `http://`, `https://`, `www.`로 시작하는 문자열만 센다 (`https://www.`는 1개). 접두어 없는 도메인(`example.com`)과 `message` 밖의 필드는 세지 않는다.
- `email`은 앞뒤 공백 제거 후 소문자로 저장하고, 빈 `subject`는 `null`로 저장한다.
- 저장하지 않는 정보: IP, User-Agent, 허니팟 값, 폼 토큰. 조용한 거부는 사유(`honeypot` / `too-fast` / `duplicate`)와 누적 건수만 로그에 남긴다.
- 알려진 한계: 완전히 같은 내용이 동시에 두 번 제출되면 둘 다 저장될 수 있다 (중복 판정에 "24시간 안" 조건이 있어 unique 인덱스로 막지 않는다).

### 8.10 `POST /visits` — 공개

프론트엔드가 페이지(라우트) 진입 시 호출한다. `fetch(..., { keepalive: true })` 사용을 권장한다.

```json
// 요청
{ "path": "/projects/developer-portfolio", "referrer": "https://www.google.com/search?q=..." }
```

```http
204 No Content
```

| 항목 | 규칙 |
| --- | --- |
| `path` | 필수. `/`로 시작, 최대 200자. 서버가 쿼리스트링·해시 제거, 끝의 `/` 정규화 |
| `referrer` | 선택. 서버가 호스트명만 추출. 자기 사이트 호스트면 `null` 처리. 원문은 저장하지 않음 |
| 기록하지 않는 경우 | 관리자 세션이 있는 요청, 봇 User-Agent, `Sec-Purpose: prefetch` 요청, 30분 내 동일 방문자·동일 경로 (중복) |
| 응답 | 기록·미기록과 관계없이 **항상 204** (검증 실패 400, 빈도 초과 429 제외) |

- 쿠키를 발급하거나 읽지 않는다 (관리자 세션 확인 제외). 중복 집계 기준은 `DESIGN_REVIEW.md` 2장.
- **처리 순서:** (전역) Origin·Content-Type·크기 → 빈도 제한(1분 60회, 429) → 입력 검증(400) → 제외 판정 → 기록 → 204. 검증이 먼저라 봇이 잘못된 경로를 보내도 400이다.
- **경로:** `/`로 시작해야 한다. 쿼리·해시를 제거하고 끝의 `/`를 제거한다(루트 `/` 유지). 대소문자·퍼센트 인코딩은 그대로 둔다. 정규화 후 200자 초과, URL 경로에 쓸 수 없는 문자(공백, 인코딩하지 않은 한글 등) 포함, 원문 2,048자 초과는 400.
- **referrer:** 원문 2,048자까지. 해석할 수 없거나 http/https가 아니거나 호스트가 `CLIENT_ORIGIN`과 같으면 `null`로 저장한다(400 아님). 호스트명은 소문자로 저장한다.
- **제외 판정:** 세션에 `adminId`가 있는 요청 / User-Agent가 비어 있거나 봇 패턴(크롤러·미리보기·모니터링·HTTP 라이브러리)과 일치 / `Sec-Purpose`에 `prefetch`·`prerender`, `Purpose: prefetch`, `X-Purpose: preview`, `X-Moz: prefetch`. **관리자 제외는 프론트엔드가 `credentials: 'include'`로 보내 세션 쿠키가 전달될 때만 동작한다.**
- **중복 제거는 `visit_events.dedupKey_unique` 인덱스가 실제로 있어야 보장된다.** 인덱스가 없으면 같은 방문이 여러 번 저장된다.

---

## 9. 인증 API

### 9.1 `POST /auth/login` — 공개

```json
// 요청
{ "email": "admin@example.com", "password": "********" }
```

```http
200 OK
Set-Cookie: __Host-sid=...; Path=/; Expires=<2시간 후>; HttpOnly; Secure; SameSite=Lax
```

```json
{
  "success": true,
  "data": { "admin": { "id": "671e00...", "email": "admin@example.com" } }
}
```

| 상황 | 응답 |
| --- | --- |
| 이메일 없음 또는 비밀번호 불일치 | 401 `INVALID_CREDENTIALS` (같은 메시지, 응답 시간 차이 최소화) |
| 연속 5회 실패로 잠금 중 | 429 `TOO_MANY_ATTEMPTS` + `Retry-After` |
| IP 빈도 제한 초과 | 429 `RATE_LIMITED` |

- 이미 로그인된 상태에서 다시 로그인하면 기존 세션을 폐기하고 새 세션을 발급한다.

### 9.2 `POST /auth/logout` — 세션 선택

- 204. 서버 세션 삭제, `Set-Cookie`로 쿠키 만료.
- 세션이 없어도 204를 반환한다 (멱등). 인증 미들웨어를 거치지 않는다.
- `Origin` 검증은 적용한다 (불일치·누락 → 403). 본문이 없으므로 Content-Type 검사는 하지 않는다.

### 9.3 `GET /auth/me` — 🔒 관리자

```json
// 200
{
  "success": true,
  "data": { "id": "671e00...", "email": "admin@example.com", "role": "admin", "lastLoginAt": "2026-10-15T02:55:00.000Z" }
}
```

- 프론트엔드의 관리자 화면 진입 시 로그인 상태 확인용. 세션 없음 → 401.

### 9.4 `PATCH /auth/password` — 🔒 관리자

```json
// 요청
{ "currentPassword": "********", "newPassword": "************" }
```

- 204. `newPassword`는 최소 12자, 최대 128자, `currentPassword`와 달라야 함 (제안).
- `currentPassword` 불일치 → 401 `INVALID_CREDENTIALS` (로그인 실패 횟수에 포함).
- 성공 시 `admins.passwordChangedAt` 갱신 → 현재 세션 ID 재발급 및 `loginAt` 갱신 → 나머지 세션 모두 삭제.

---

## 10. 관리자 콘텐츠 API

모든 엔드포인트: 🔒 관리자. 공통 규칙은 다음과 같다.

| 규칙 | 내용 |
| --- | --- |
| `POST` | 필수 필드 모두 포함. 서버 관리 필드(`id`, `createdAt`, `updatedAt`, `publishedAt`)를 보내면 400 |
| `PATCH` | 보낸 필드만 수정. 선택 필드에 `null`을 보내면 값 삭제. 스키마에 없는 필드는 400. 빈 본문(`{}`)도 400 |
| 인증 순서 | `/admin/**`는 인증을 먼저 확인한다. 로그인하지 않은 요청은 경로 존재·본문 형식과 관계없이 401 |
| 응답 | 관리자 응답은 공개 응답의 모든 필드 + `visibility`, `skillIds`, `projectIds`, `sortOrder`, `createdAt`, `updatedAt` |
| `publishedAt` | `visibility`가 처음 `public`이 될 때 서버가 설정 |
| `slug` 변경 | 허용. 기존 공개 URL이 깨질 수 있으므로 화면에서 경고 (리다이렉트 기능은 범위 밖) |
| 존재하지 않는 `:id` | 400 `INVALID_ID`(형식 오류) / 404 `NOT_FOUND`(문서 없음) |

### 10.1 `PUT /admin/profile`

- 요청 본문: `DATABASE.md` 4.1의 편집 가능 필드 전체 (`singletonKey` 제외). 없으면 생성, 있으면 전체 교체. **프로필을 만드는 유일한 경로다.**
- **전체 교체:** 생략한 선택 필드는 기존 값을 유지하지 않고 기본값으로 초기화한다 (`bio`·`email`·`avatarUrl`·`resumeUrl` → `null`, `goals`·`links` → `[]`). 화면은 항상 전체 값을 보내야 한다.
- 필수: `name`, `headline`. `singletonKey`, `id`, `createdAt`, `updatedAt` 등 정의되지 않은 필드는 400 (`links` 항목 안의 정의되지 않은 키도 400).
- `email`은 앞뒤 공백 제거 후 소문자로 저장하고, 빈 문자열은 `null`로 저장한다.
- 처음 생성하면 201, 기존 문서를 교체하면 200. 교체해도 `createdAt`은 유지된다.
- 응답 본문: 공개 프로필 필드(8.2) + `createdAt`. `id`, `_id`, `singletonKey`는 반환하지 않는다.
- 동시 요청: 처음 생성이 겹쳐도 `profiles.singletonKey_unique` 인덱스가 있으면 문서는 1개이고 201은 한 번만 반환된다. **이 보장은 인덱스에 의존하므로, 운영 DB에서 첫 `PUT` 전에 `npm run db:sync-indexes`를 실행해야 한다.**

### 10.2 프로젝트 — `/admin/projects`

```json
// POST /api/v1/admin/projects 요청
{
  "title": "개발자 포트폴리오",
  "slug": "developer-portfolio",
  "summary": "Express와 MongoDB로 만든 개인 포트폴리오",
  "description": "## 개요\n...",
  "role": "백엔드 설계 및 구현",
  "teamSize": 1,
  "highlights": ["관리자 세션 인증 구현"],
  "startedAt": "2026-09-01",
  "endedAt": null,
  "skillIds": ["671e1f2a9b1e8a00000000a1"],
  "tags": ["portfolio"],
  "githubUrl": "https://github.com/example/portfolio",
  "demoUrl": null,
  "thumbnailUrl": null,
  "featured": true,
  "sortOrder": 0,
  "visibility": "private"
}
```

```json
// 201
{
  "success": true,
  "data": {
    "id": "671e1f2a9b1e8a0012345678",
    "slug": "developer-portfolio",
    "title": "개발자 포트폴리오",
    "visibility": "private",
    "skillIds": ["671e1f2a9b1e8a00000000a1"],
    "skills": [ { "id": "671e1f2a9b1e8a00000000a1", "name": "Node.js", "slug": "nodejs", "category": "backend" } ],
    "publishedAt": null,
    "createdAt": "2026-10-15T03:00:00.000Z",
    "updatedAt": "2026-10-15T03:00:00.000Z"
  }
}
```

> 응답 예시는 일부 필드만 표시했다. 실제 응답에는 `DATABASE.md` 4.2의 모든 필드가 포함된다.

- `startedAt`, `endedAt`은 `YYYY-MM-DD` 또는 ISO-8601 문자열을 받는다.
- 존재하지 않는 `skillIds` → 400 `VALIDATION_ERROR` (`field: "skillIds"`).
- `slug` 중복 → 409 `DUPLICATE_KEY`.
- `DELETE` 시 학습 기록의 `projectIds`에서 해당 ID를 제거한다.

### 10.3 기술 — `/admin/skills`

- 요청 필드: `name`, `slug`, `category`, `status`, `description`, `iconKey`, `sortOrder`, `visibility`.
- `GET /admin/skills/:id` 응답에는 `usage: { projects: 3, studyRecords: 7 }`를 포함한다.
- `DELETE` 시 참조 중이면:

```json
// 409
{
  "success": false,
  "error": {
    "code": "RESOURCE_IN_USE",
    "message": "다른 항목에서 사용 중인 기술은 삭제할 수 없습니다.",
    "requestId": "b1c2d3e4"
  }
}
```

> 참조 개수는 오류 응답이 아니라 `GET /admin/skills/:id`의 `usage`로 확인한다 (오류 형식을 단순하게 유지).

### 10.4 학습 기록 — `/admin/study-records`

- 요청 필드: `title`, `slug`, `category`, `summary`, `content`, `skillIds`, `projectIds`, `tags`, `learnedAt`, `visibility`.
- `learnedAt`이 미래 날짜 → 400.

---

## 11. 관리자 문의 API

모든 엔드포인트: 🔒 관리자.

### 11.1 `GET /admin/inquiries`

```http
GET /api/v1/admin/inquiries?status=new&page=1&limit=20
```

- 목록 항목: `id`, `name`, `email`, `subject`, `messagePreview`(앞 100자), `status`, `createdAt`, `expiresAt`.
- 새 문의 개수는 `?status=new`의 `meta.totalItems`로 확인한다.
- 검색·필터·정렬은 5.5의 `/admin/inquiries` 행을 따른다: `q`(이름·이메일·제목, 본문 제외), `status`, `from`·`to`(접수일 `createdAt`, KST), `sort=createdAt`(기본 `-createdAt`). `messagePreview`는 이모지가 잘리지 않도록 글자 단위로 자른다.

### 11.2 `GET /admin/inquiries/:id`

- 전체 필드: 위 + `message`, `adminMemo`, `consent`(`version`, `agreedAt`), `readAt`, `repliedAt`, `updatedAt`.
- 조회만으로 `status`를 바꾸지 않는다. 읽음 처리는 `PATCH`로 명시적으로 한다 (GET의 부작용 방지).

### 11.3 `PATCH /admin/inquiries/:id`

```json
// 요청
{ "status": "replied", "adminMemo": "10/15 이메일 회신 완료" }
```

- 수정 가능 필드: `status`, `adminMemo`만. 문의자 입력 필드는 수정 불가.
- `status`가 처음 `read`가 되면 `readAt`, 처음 `replied`가 되면 `repliedAt`을 기록한다. `replied`로 바꿀 때 `readAt`이 비어 있으면 함께 기록한다(회신은 읽음 포함).
- `archived`로 바꿀 때는 새 시각을 기록하지 않고, `new`로 되돌려도 기존 `readAt`·`repliedAt`은 유지한다.
- 빈 본문, `status`·`adminMemo` 외의 필드, `status: null`은 400. `adminMemo: null`은 메모 삭제.

### 11.4 `DELETE /admin/inquiries/:id`

- 204. 보관 기간과 관계없이 즉시 물리 삭제 (문의자의 삭제 요청 대응).

---

## 12. 방문 통계 API

### 12.1 `GET /admin/stats/visits` — 🔒 관리자

```http
GET /api/v1/admin/stats/visits?from=2026-10-09&to=2026-10-15&top=10
```

| 파라미터 | 형식 | 기본값 | 제약 |
| --- | --- | --- | --- |
| `from` | `YYYY-MM-DD` (KST) | 오늘 포함 최근 7일의 시작일 | |
| `to` | `YYYY-MM-DD` (KST) | 오늘 | 미래 불가 |
| `top` | 정수 | `10` | 1~20 |

- 기간은 최대 365일. 초과 시 400.

```json
// 200
{
  "success": true,
  "data": {
    "range": { "from": "2026-10-09", "to": "2026-10-15", "timezone": "Asia/Seoul" },
    "summary": {
      "pageviews": 1234,
      "dailyUniqueVisitorsSum": 456,
      "avgDailyUniqueVisitors": 65.1
    },
    "daily": [
      { "date": "2026-10-09", "pageviews": 150, "uniqueVisitors": 60 }
    ],
    "topPaths": [ { "path": "/", "pageviews": 500 } ],
    "topReferrers": [ { "host": "github.com", "count": 80 } ],
    "devices": { "desktop": 800, "mobile": 400, "tablet": 30, "unknown": 4 },
    "dataQuality": {
      "includesToday": true,
      "approximateTopLists": false
    }
  }
}
```

- `daily`는 방문이 없는 날도 0으로 채워 연속된 날짜를 반환한다.
- 고유 방문자는 **일 단위로만** 정확하다. 여러 날의 합계는 `dailyUniqueVisitorsSum`(일별 고유 방문자의 합)으로 표기해 "기간 내 고유 방문자"로 오해하지 않게 한다 (`DESIGN_REVIEW.md` 2장).
- 원본 보관 기간(90일)을 벗어난 날짜는 `visit_daily_stats`의 일별 상위 20개 목록을 합산하므로 `topPaths`, `topReferrers`가 근사값이 된다. 이 경우 `dataQuality.approximateTopLists: true`.
- 오늘 데이터는 실시간 계산되어 조회 시점마다 바뀐다. KST 자정 후 5분 동안은 어제도 아직 마감 전이라 원본에서 실시간 계산한다.
- **기간 기본값:** 둘 다 없으면 오늘 포함 최근 7일, `to`만 주면 `from = to − 6일`, `from`만 주면 `to = 오늘`. `to`가 미래, `from > to`, 기간 365일 초과(양 끝 포함)는 400.
- **조회 시 보정:** 응답 전에 가장 이른 원본 이벤트 날짜(보관 기간 안) 이후의 마감된 날짜 중 집계가 빠진 날을 채운다. 집계가 없는 날(원본 이벤트가 없던 기간, 보관 기간 밖)은 0으로 응답하고 저장하지 않는다. 원본 이벤트가 하나도 없으면 DB에 아무것도 쓰지 않는다.
- `avgDailyUniqueVisitors` = `dailyUniqueVisitorsSum` ÷ 범위의 날짜 수(0인 날 포함), 소수 첫째 자리 반올림.
- `topPaths`·`topReferrers`는 많은 순, 같으면 이름순. 범위가 모두 원본 보관 기간(KST 00:00이 지금으로부터 90일 이내인 날) 안이면 원본에서 정확히 계산한다.

---

## 13. 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-10-15 | v0.1 | 최초 초안 작성 (검토 대기) |
| 2026-10-15 | v0.2 | 로그아웃 "세션 선택", Origin 검증 범위, 비밀번호 변경 시 세션 규칙, `relatedProjects`, 형식 오류 slug 404, 프로필 PUT 201/200 |
