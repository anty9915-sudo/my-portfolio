# DATABASE.md — 데이터베이스 설계 (초안)

> **문서 상태: 초안 v0.2 (2026-10-15) — 기본안 반영, 구현 기준으로 사용**
>
> - 이 문서는 `CLAUDE.md` 5장의 원칙을 따르며, 상세 필드·검증·인덱스·보관 정책의 기준 문서가 될 예정이다.
> - 사용자 승인 전까지 이 문서의 모든 설계는 **제안**이다. 선택지가 남은 항목은 **미정**으로 표시하고, 결정 근거와 대안은 [`DESIGN_REVIEW.md`](./DESIGN_REVIEW.md)에 정리한다.
> - API 요청·응답 형식은 [`API.md`](./API.md)를 기준으로 한다. 이 문서는 저장 구조만 다룬다.

### 표기 규칙

| 표기 | 의미 |
| --- | --- |
| **확정** | 사용자가 이미 승인한 사항 (기능 범위, 기술 스택) |
| **제안** | 이 문서가 권장하는 설계. 승인 전까지 확정 아님 |
| **미정** | 선택지가 남아 있어 사용자 결정이 필요한 사항 |

---

## 1. 개요

| 항목 | 내용 | 상태 |
| --- | --- | --- |
| DBMS | MongoDB Atlas | 확정 |
| ODM | Mongoose | 확정 |
| 클러스터 | Atlas 무료 M0 우선 검토 | `CLAUDE.md` 기준 (제안) |
| DB 이름 | 운영 `portfolio`, **개발 `portfolio_dev`**(Atlas, 사용 중), 자동 테스트는 `mongodb-memory-server`의 `portfolio_test`. `MONGODB_URI` 경로에 포함해 지정 | 기본안 |
| 시간 저장 | 모든 `Date`는 UTC로 저장, API에서는 ISO-8601 문자열로 반환 | 제안 |
| 통계 기준 시간대 | `Asia/Seoul` (KST). 방문 통계의 날짜 키(`dateKey`)에만 적용 | 제안 |
| 컬렉션 이름 | 소문자 복수형, 단어 구분은 `_` (예: `study_records`) | `CLAUDE.md` 기준 |

### 1.1 Mongoose 공통 설정 (제안)

- 모든 스키마에 `timestamps: true`를 적용해 `createdAt`, `updatedAt`을 자동 관리한다. (예외: `visit_events`는 `occurredAt`만 사용)
- `strict: true`(기본값)를 유지해 스키마에 없는 필드는 저장하지 않는다.
- `versionKey: false`로 `__v`를 비활성화한다. 단일 관리자 환경이라 동시 편집 충돌 제어의 필요성이 낮다.
- `mongoose.set('sanitizeFilter', true)`로 사용자 입력이 `$` 연산자로 해석되는 것을 막는다. 이와 별도로 요청 경계에서 입력값을 검증한다 (`CLAUDE.md` 4.2, 8장).
- `mongoose.set('strictQuery', true)`로 스키마에 없는 필드의 쿼리 조건을 무시한다.
- API 응답은 Mongoose 문서를 그대로 반환하지 않고, 컬렉션별 변환 함수에서 명시적으로 구성한다 (`CLAUDE.md` 5.4).

---

## 2. 컬렉션 요약

사용자가 요청한 7개 컬렉션 외에, 보관 정책과 인증 구현에 필요한 **보조 컬렉션 2개**를 제안한다.

| 컬렉션 | 목적 | 예상 규모 | 공개 범위 | 보관 | 구분 |
| --- | --- | --- | --- | --- | --- |
| `profiles` | 개발자 프로필 (단일 문서) | 1건 | 공개 | 영구 | 요청 |
| `projects` | 프로젝트 | ~100건 | `visibility`에 따름 | 영구 | 요청 |
| `skills` | 기술 스택 및 학습 상태 | ~200건 | `visibility`에 따름 | 영구 | 요청 |
| `study_records` | 학습 기록·문제 해결 기록 | ~1,000건 | `visibility`에 따름 | 영구 | 요청 |
| `admins` | 관리자 계정 | 1건 | 비공개 | 계정 존재 기간 | 요청 |
| `inquiries` | 방문자 문의 | 수백 건 | 비공개 | 접수 후 180일 (제안) | 요청 |
| `visit_events` | 방문(페이지뷰) 원본 이벤트 | 일 수백~수천 건 | 비공개 | 90일 (제안) | 요청 |
| `visit_daily_stats` | 일별 방문 집계 | 연 365건 | 비공개 | 영구 | **보조 (제안)** |
| `sessions` | 관리자 로그인 세션 | 수 건 | 비공개 | 세션 만료 시 삭제 | **보조 (제안)** |

- `visit_daily_stats`: 원본 이벤트를 90일 후 삭제하더라도 장기 추이를 볼 수 있도록 비식별 집계만 영구 보관한다.
- `sessions`: 관리자 인증 기본안(서버 세션 + HttpOnly 쿠키, `DESIGN_REVIEW.md` 1장)에 필요하다. `connect-mongo`가 컬렉션 구조를 관리한다.

---

## 3. 공통 필드 규칙 (제안)

| 규칙 | 내용 |
| --- | --- |
| 문자열 | 저장 전 앞뒤 공백 제거(`trim`). 선택 필드의 빈 문자열은 `null`로 정규화 |
| `slug` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3~80자 (**`skills`만 1~50자** — `c`, `go`, `r` 허용), 컬렉션 내 유일. 한글 제목은 자동 변환이 어려우므로 관리자가 직접 입력 |
| URL | `https://`만 허용, 최대 2,048자, `new URL()`로 파싱 가능해야 함. `javascript:`, `data:` 등 차단 |
| 이메일 | 최대 254자, 소문자로 정규화, 형식 검증 (Zod `email()` 기준) |
| 배열 | 최대 길이 지정, 요소 형식 검증, 중복 요소 제거 |
| `tags` | 각 1~30자, 소문자·숫자·하이픈·한글 허용, 최대 10개 |
| `visibility` | `public` \| `private`. 기본값 `private`. 공개 API는 `public`만 반환 |
| `sortOrder` | 정수 0~9,999, 기본값 0. 작을수록 앞에 노출 |
| enum | 소문자 영문 값으로 저장, 화면 표시용 한글 라벨은 프론트엔드에서 매핑 |
| Markdown 필드 | 서버는 원문을 저장한다. 렌더링 시 클라이언트에서 HTML sanitize 필수 (XSS 방지) |
| ObjectId 참조 | 저장 전 참조 대상 존재 여부를 서비스 계층에서 확인 |

> `CLAUDE.md` 5.2의 `study_records.visibility`를 `projects`, `skills`에도 동일하게 적용해 "비공개 = 초안" 상태를 표현한다. 별도의 `draft` 상태는 두지 않는다 (제안).

---

## 4. 컬렉션 상세

### 4.1 `profiles`

포트폴리오 소유자의 프로필. **단일 문서**로 운영한다.

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `singletonKey` | String | ✅ | `"default"` | 고정값 `"default"`, unique | 문서가 2개 이상 생기지 않도록 강제 |
| `name` | String | ✅ | | 1~50자 | |
| `headline` | String | ✅ | | 1~100자 | 한 줄 소개 |
| `bio` | String | | `null` | 최대 3,000자, Markdown | 자기소개 |
| `goals` | [String] | | `[]` | 최대 10개, 각 1~200자 | 개발 목표 (README 기능 계획 반영) |
| `email` | String | | `null` | 이메일 형식, 최대 254자 | **공개 연락처**. 앞뒤 공백 제거·소문자로 저장, 빈 문자열은 `null`. 공개를 원치 않으면 `null` |
| `avatarUrl` | String | | `null` | URL 규칙 | 외부 이미지 URL (업로드 기능 없음) |
| `resumeUrl` | String | | `null` | URL 규칙 | |
| `links` | [Object] | | `[]` | 최대 10개 | 아래 하위 필드 |
| `links[].type` | String | ✅ | | `github` \| `blog` \| `linkedin` \| `other` | |
| `links[].label` | String | ✅ | | 1~30자 | |
| `links[].url` | String | ✅ | | URL 규칙 | |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

### 4.2 `projects`

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `title` | String | ✅ | | 1~100자 | |
| `slug` | String | ✅ | | slug 규칙, unique | 공개 상세 URL에 사용 |
| `summary` | String | ✅ | | 1~200자 | 목록 카드용 요약 |
| `description` | String | ✅ | | 1~20,000자, Markdown | 상세 설명 |
| `role` | String | | `null` | 최대 200자 | 담당 역할 |
| `teamSize` | Number | | `null` | 정수 1~50 | |
| `highlights` | [String] | | `[]` | 최대 10개, 각 1~200자 | 주요 성과·해결한 문제 |
| `startedAt` | Date | ✅ | | | 프로젝트 시작일 |
| `endedAt` | Date | | `null` | `startedAt` 이상 | `null`이면 진행 중 |
| `skillIds` | [ObjectId] | | `[]` | 최대 30개, `skills` 참조, 중복 불가 | 구 후보명 `techStack` |
| `tags` | [String] | | `[]` | 공통 `tags` 규칙 | |
| `githubUrl` | String | | `null` | URL 규칙 | |
| `demoUrl` | String | | `null` | URL 규칙 | |
| `thumbnailUrl` | String | | `null` | URL 규칙 | 외부 이미지 URL |
| `featured` | Boolean | | `false` | | 대표 프로젝트 |
| `sortOrder` | Number | | `0` | 공통 규칙 | |
| `visibility` | String | | `"private"` | `public` \| `private` | |
| `publishedAt` | Date | | `null` | | 처음 `public`이 된 시각. 이후 비공개 전환 시에도 유지 |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

### 4.3 `skills`

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `name` | String | ✅ | | 1~50자, 대소문자 무시 unique | 예: `Node.js` |
| `slug` | String | ✅ | | slug 패턴, **1~50자**, unique | 필터 파라미터에 사용 (예: `nodejs`, `go`) |
| `category` | String | ✅ | | `language` \| `frontend` \| `backend` \| `database` \| `devops` \| `security` \| `tool` \| `other` | 분류값은 제안 |
| `status` | String | ✅ | | `planned` \| `learning` \| `applied` \| `proficient` | 학습 예정 / 학습 중 / 프로젝트 적용 / 숙련 (라벨은 제안) |
| `description` | String | | `null` | 최대 300자 | |
| `iconKey` | String | | `null` | 최대 50자, `^[a-z0-9-]+$` | 프론트엔드 아이콘 매핑용 키 |
| `sortOrder` | Number | | `0` | 공통 규칙 | 카테고리 내 정렬 |
| `visibility` | String | | `"private"` | `public` \| `private` | |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

### 4.4 `study_records`

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `title` | String | ✅ | | 1~120자 | |
| `slug` | String | ✅ | | slug 규칙, unique | |
| `category` | String | ✅ | | `study` \| `troubleshooting` | 학습 정리 / 문제 해결 |
| `summary` | String | | `null` | 최대 300자 | 목록용 요약 |
| `content` | String | ✅ | | 1~50,000자, Markdown | |
| `skillIds` | [ObjectId] | | `[]` | 최대 20개, `skills` 참조 | 구 후보명 `relatedSkills` |
| `projectIds` | [ObjectId] | | `[]` | 최대 10개, `projects` 참조 | 관련 프로젝트 |
| `tags` | [String] | | `[]` | 공통 `tags` 규칙 | |
| `learnedAt` | Date | ✅ | | 미래 날짜 불가 | 학습·해결 일자 |
| `visibility` | String | | `"private"` | `public` \| `private` | |
| `publishedAt` | Date | | `null` | | `projects`와 동일 규칙 |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

### 4.5 `admins`

1단계에서는 **관리자 1명**만 존재한다. 회원가입 API는 두지 않으며, 계정은 별도 초기화 스크립트로 생성한다 (제안, 구현은 승인 후).

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `email` | String | ✅ | | 이메일 규칙, unique | 로그인 ID |
| `passwordHash` | String | ✅ | | | `select: false`. 평문 저장 금지. **Argon2id** (설치 실패 시 bcrypt) |
| `role` | String | | `"admin"` | `admin` | 향후 확장 대비 단일 값 |
| `failedLoginCount` | Number | | `0` | 정수 ≥ 0 | 연속 실패 횟수. 성공 시 0으로 초기화 |
| `lockUntil` | Date | | `null` | | 이 시각까지 로그인 차단 |
| `lastLoginAt` | Date | | `null` | | 마지막 로그인 성공 시각 |
| `passwordChangedAt` | Date | | `null` | | 세션의 `loginAt`이 이 시각보다 이전이면 무효. 비밀번호 변경 시 현재 세션은 재발급(`loginAt` 갱신)하므로 유지되고 나머지 세션은 삭제 |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

- 로그인 IP, User-Agent 등 접속 기록은 저장하지 않는다 (개인정보 최소 수집).
- `passwordHash`, `failedLoginCount`, `lockUntil`은 어떤 API 응답에도 포함하지 않는다.

### 4.6 `inquiries`

방문자 연락 폼으로 접수된 문의.

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `name` | String | ✅ | | 1~50자 | 이름 또는 닉네임 |
| `email` | String | ✅ | | 이메일 규칙 | 회신용 |
| `subject` | String | | `null` | 최대 100자 | |
| `message` | String | ✅ | | 10~3,000자, 일반 텍스트 | URL 4개 이상 포함 시 거부 (스팸 규칙) |
| `status` | String | | `"new"` | `new` \| `read` \| `replied` \| `archived` | 관리자만 변경 |
| `adminMemo` | String | | `null` | 최대 1,000자 | 관리자 전용 메모 |
| `consent.agreed` | Boolean | ✅ | | 반드시 `true` | 개인정보 수집·이용 동의 |
| `consent.version` | String | ✅ | | 최대 20자, 서버의 현재 버전과 일치 | 동의 문구 버전 (예: `2026-10-01`). 현재 버전은 **코드 상수**로 관리 |
| `consent.agreedAt` | Date | ✅ | | | 서버 수신 시각으로 기록 |
| `contentHash` | String | ✅ | | SHA-256 hex 64자 | 중복 제출 탐지용 (아래 참고) |
| `readAt` | Date | | `null` | | `status`가 처음 `read`가 된 시각 |
| `repliedAt` | Date | | `null` | | |
| `expiresAt` | Date | ✅ | | | 자동 파기 시각 = 접수 시각 + 180일 (기본안) |
| `createdAt` / `updatedAt` | Date | 자동 | | | |

- **저장하지 않는 정보:** IP 주소, User-Agent, 허니팟 필드 값, 폼 토큰. 요청 빈도 제한에 쓰는 IP는 메모리 내 제한 저장소에만 일시적으로 존재한다.
- `contentHash` = `SHA-256(소문자 email + "\n" + 공백 정규화한 message)`. 공백 정규화는 앞뒤 공백 제거 + 줄바꿈을 포함한 연속 공백을 한 칸으로 바꾸는 것이다. 24시간 내 같은 해시가 있으면 새 문서를 만들지 않는다. 문서와 함께 TTL로 삭제된다.
- `consent.version`의 현재 값은 코드 상수 `CURRENT_CONSENT_VERSION`(`2026-10-01`, `src/modules/inquiries/consent.js`)이다. **실제 동의 문구를 확정·변경할 때 이 상수도 함께 갱신해야 한다.**
- **TTL 주의:** `inquiries_ttl` 인덱스가 생성되기 전에는 `expiresAt`이 지나도 문의가 자동 삭제되지 않는다. 180일 보관 정책을 지키려면 운영 DB에서 `npm run db:sync-indexes`를 실행해야 한다.

### 4.7 `visit_events`

페이지뷰 원본 이벤트. **식별 가능한 정보를 저장하지 않는 것**을 원칙으로 한다. 집계 기준은 `DESIGN_REVIEW.md` 2장 참고.

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `occurredAt` | Date | ✅ | | 서버 수신 시각 | 클라이언트 시각은 신뢰하지 않음 |
| `dateKey` | String | ✅ | | `YYYY-MM-DD` | `occurredAt`의 KST 날짜 |
| `path` | String | ✅ | | `/`로 시작, 최대 200자, 쿼리스트링·해시 제거 | 프론트엔드 라우트 경로 |
| `referrerHost` | String | | `null` | 최대 253자, 호스트명만 | 외부 유입일 때만 기록. 내부 이동은 `null` |
| `deviceType` | String | ✅ | | `desktop` \| `mobile` \| `tablet` \| `unknown` | User-Agent에서 서버가 파생. UA 원문은 저장 안 함 |
| `visitorHash` | String | ✅ | | hex 64자 | `HMAC-SHA256(일별 키, IP + UA)`, 일별 키 = `HMAC-SHA256(VISIT_HASH_SECRET, dateKey)`. 날짜가 바뀌면 다른 값 |
| `dedupKey` | String | ✅ | | hex 64자, unique | `SHA-256(visitorHash + path + 30분 구간 번호)` |

- `timestamps`를 사용하지 않는다 (`occurredAt`으로 대체).
- Time Series 컬렉션은 unique 인덱스를 지원하지 않으므로 일반 컬렉션 + TTL 인덱스로 설계한다.
- **인덱스 의존성:** 30분 중복 제거는 `dedupKey_unique`, 90일 자동 삭제는 `visit_events_ttl`이 실제로 있어야 동작한다. 운영 DB에서 `npm run db:sync-indexes`를 실행하기 전에는 같은 방문이 여러 번 저장되고, 해시된 방문 기록이 90일이 지나도 삭제되지 않아 보관 정책을 지키지 못한다.

### 4.8 `visit_daily_stats` (보조, 제안)

| 필드 | 자료형 | 필수 | 기본값 | 검증 규칙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `_id` | ObjectId | 자동 | | | |
| `dateKey` | String | ✅ | | `YYYY-MM-DD`, unique | KST 날짜 |
| `pageviews` | Number | ✅ | | 정수 ≥ 0 | |
| `uniqueVisitors` | Number | ✅ | | 정수 ≥ 0 | 해당 일의 고유 `visitorHash` 수 |
| `topPaths` | [{ `path`, `pageviews` }] | | `[]` | 최대 20개 | |
| `topReferrers` | [{ `host`, `count` }] | | `[]` | 최대 20개 | |
| `devices` | { `desktop`, `mobile`, `tablet`, `unknown` } | ✅ | 각 0 | 정수 ≥ 0 | |
| `computedAt` | Date | ✅ | | | 마지막 집계 시각 |

- **완료된 날짜(어제 이전)만** 저장한다. 오늘 통계는 `visit_events`에서 실시간 계산한다.
- 집계 시점(제안): ① 서버 내 1시간 주기 작업이 누락된 날짜를 채움, ② 대시보드 조회 시 범위 내 누락 날짜를 즉시 보정. 추가 스케줄러 라이브러리 없이 구현 가능하다.
- 무료 호스팅의 슬립 등으로 90일 넘게 집계가 실행되지 않으면 해당 기간 원본이 삭제되어 복구할 수 없다. 이 위험은 `DESIGN_REVIEW.md` 미정 사항에 기록한다.
- **마감 기준 (6단계 확정):** KST 자정 후 5분이 지나야 전날을 마감·집계한다. 집계 시작일은 **가장 이른 원본 이벤트 날짜**와 원본 보관 기간 시작일(KST 00:00이 지금으로부터 90일 이내인 첫 날) 중 늦은 날이다. 시작일 이후의 마감된 날짜는 방문이 없어도 0으로 저장한다. 원본 이벤트가 하나도 없으면 아무것도 저장하지 않는다. 같은 날짜를 다시 집계해도 같은 결과로 덮어쓴다.
- **스케줄러:** `server.js`가 DB 연결 후 한 번 실행하고 이후 1시간마다 실행한다(`setInterval`, 추가 라이브러리 없음). 같은 프로세스 안에서는 실행이 겹치지 않으며(진행 중인 실행을 함께 기다림), 실패하면 로그만 남기고 다음 주기에 다시 시도한다. 종료 신호를 받으면 타이머를 정리한다.
- **첫 시작 시 동작 (2026-10-16 수정):** 원본 방문 이벤트가 하나도 없으면 스케줄러와 대시보드 보정은 읽기만 하고 아무것도 쓰지 않는다. 따라서 빈 DB에서 서버를 시작해도 `visit_daily_stats` 컬렉션이 생기지 않는다(서버 시작 시 컬렉션 자동 생성 금지 원칙). 첫 방문이 기록된 뒤부터 그 날짜 기준으로 집계를 시작한다. (수정 전에는 빈 DB 첫 실행이 컬렉션을 만들고 약 89일치를 0으로 저장했다 — 메모리 DB 재현으로 확인 후 변경)
- **서버가 여러 대일 때:** 각 서버가 같은 결과를 덮어쓰므로 값은 같지만, 서버끼리는 동시 실행을 막지 못한다. `dateKey_unique` 인덱스가 없으면 동시 upsert로 같은 날짜 문서가 2개 생길 수 있다.

### 4.9 `sessions` (보조, 제안)

관리자 인증 기본안(서버 세션)에 따라 `connect-mongo`가 관리한다 (패키지 설치는 승인 후). 애플리케이션 코드에서 직접 스키마를 정의하지 않는다.

| 필드 | 자료형 | 비고 |
| --- | --- | --- |
| `_id` | String | 세션 ID (무작위) |
| `expires` | Date | 만료 시각. TTL 인덱스로 자동 삭제 |
| `session` | String/Object | 직렬화된 세션 데이터. **`adminId`, `loginAt`만 저장** (제안) |

---

## 5. 참조 관계와 중복 데이터 관리

### 5.1 관계도

```text
profiles (단일)

skills ◀──── projects.skillIds[]
   ▲
   └──────── study_records.skillIds[]
projects ◀── study_records.projectIds[]

admins ──(adminId)──▶ sessions

inquiries        (독립)
visit_events ──(일별 집계)──▶ visit_daily_stats
```

### 5.2 임베드 vs 참조 결정 (제안)

| 데이터 | 방식 | 이유 |
| --- | --- | --- |
| 프로필 링크 `links` | 임베드 | 프로필과 항상 함께 조회·수정되고 개수가 적음 |
| 프로젝트 ↔ 기술 | 참조 (`projects.skillIds`) | 기술 이름·분류가 바뀌면 한 곳만 수정. 기술 필터 조회 필요 |
| 학습 기록 ↔ 기술·프로젝트 | 참조 (`skillIds`, `projectIds`) | 위와 동일 |
| 태그 `tags` | 문자열 배열 임베드 | 별도 관리 화면 없이 자유 입력. 정규화 비용 대비 이익 적음 |
| 일별 방문 집계 | 별도 컬렉션 (의도적 중복) | 원본 삭제 후에도 추이 보존 |

- 관계 방향은 "많은 쪽이 참조 배열을 가진다". `skills`에 역참조(`projectIds`)를 두지 않아 양방향 동기화 문제를 피한다.

### 5.3 조회 시 참조 해석

- 목록/상세 조회 시 `skillIds`를 모아 `skills`를 `$in`으로 **한 번에** 조회한다 (Mongoose `populate`도 내부적으로 동일하게 동작). 투영 필드는 `name`, `slug`, `category`로 제한한다.
- **공개 API에서는 `visibility: "public"`인 기술만** 포함한다. 비공개 기술은 응답 배열에서 제외된다.
- 프로젝트 상세의 "관련 학습 기록"은 `study_records.projectIds`에 해당 프로젝트 ID가 있고 공개된 문서를 최대 5개 조회한다.

### 5.4 쓰기 시 무결성 규칙 (제안)

| 상황 | 처리 |
| --- | --- |
| 존재하지 않는 `skillIds` / `projectIds`로 생성·수정 | 400 `VALIDATION_ERROR` |
| 프로젝트·학습 기록에서 참조 중인 기술 삭제 | 409 `RESOURCE_IN_USE`. 참조 개수는 `GET /admin/skills/:id`의 `usage`로 확인. 관리자가 먼저 연결 해제 |
| 프로젝트 삭제 | 삭제 후 `study_records.projectIds`에서 `$pull`로 참조 제거 |
| 학습 기록 삭제 | 참조하는 컬렉션 없음, 바로 삭제 |
| `slug` 중복 | 409 `DUPLICATE_KEY` |
| 기술 이름 대소문자만 다른 중복 (`react` / `React`) | 409 `DUPLICATE_KEY` (collation strength 2 unique 인덱스) |

- MongoDB 트랜잭션은 사용하지 않는다(제안). 프로젝트 삭제 후 `$pull`이 실패하면 남은 참조는 조회 시 존재하지 않는 ID로 무시되며, 오류를 로그로 남긴다. 트랜잭션은 Atlas M0에서도 지원되므로 필요하면 도입할 수 있다.
- 삭제는 **물리 삭제**를 기본으로 한다(제안). "숨김"은 `visibility: "private"`로 처리한다.

### 5.5 중복 데이터 목록과 동기화 방법

| 중복 데이터 | 원본 | 동기화 방법 | 불일치 허용 여부 |
| --- | --- | --- | --- |
| `visit_daily_stats` | `visit_events` | 완료된 날짜만 1회 집계, 원본 보관 기간(90일) 내에는 재계산 가능 | 원본 삭제 후에는 집계가 유일한 기록 |
| `inquiries.contentHash` | `email`, `message` | 생성 시 계산, 이후 수정 없음 | 해당 없음 |
| `visit_events.dateKey` | `occurredAt` | 생성 시 계산 | 해당 없음 |

---

## 6. 조회 설계와 인덱스

### 6.1 원칙

- 예상 데이터가 수십~수천 건 수준이라 대부분의 쿼리는 인덱스 없이도 빠르다. 아래 인덱스는 **unique 제약, TTL, 실제 조회 패턴**이 있는 경우에만 둔다 (`CLAUDE.md` 5.3 "근거 없는 인덱스 금지").
- 정렬에는 항상 `_id`를 마지막 기준으로 추가해 같은 값이 있을 때도 페이지 간 순서가 흔들리지 않게 한다.
- 페이지네이션은 **page/limit (offset) 방식**을 제안한다. 근거와 대안은 `DESIGN_REVIEW.md` 6장 및 `API.md` 5장 참고.
  - 쿼리: `find(filter).sort(sort).skip((page-1)*limit).limit(limit)` + `countDocuments(filter)`
  - 데이터 규모상 `skip` 비용은 무시할 수 있다. 수만 건 이상이 되면 커서 방식으로 전환을 검토한다.

### 6.2 주요 조회 패턴

| 조회 | 필터 | 기본 정렬 | 사용 인덱스 |
| --- | --- | --- | --- |
| 공개 프로젝트 목록 | `visibility=public` (+ `featured`, `skillIds`, `tags`, 검색어) | `sortOrder` ↑, `startedAt` ↓, `_id` ↓ | `projects_public_list` |
| 프로젝트 기술 필터 | `skillIds=<id>`, `visibility=public` | 위와 동일 | `projects_skillIds` |
| 공개 프로젝트 상세 | `slug`, `visibility=public` | — | `slug` unique |
| 공개 기술 목록 | `visibility=public` (+ `category`, `status`) | `category` ↑, `sortOrder` ↑, `name` ↑ | `skills_public_list` |
| 공개 학습 기록 목록 | `visibility=public` (+ `category`, `skillIds`, `tags`, 기간) | `learnedAt` ↓, `_id` ↓ | `study_records_public_list` |
| 프로젝트별 관련 학습 기록 | `projectIds=<id>`, `visibility=public` | `learnedAt` ↓ | `study_records_projectIds` |
| 관리자 문의 목록 | `status` (선택) | `createdAt` ↓ | `inquiries_status_createdAt` |
| 문의 중복 확인 | `contentHash`, `createdAt ≥ 24시간 전` | — | `inquiries_contentHash` |
| 기간별 방문 집계 | `dateKey` 범위 | — | `visit_events_dateKey_path`, `visit_daily_stats.dateKey` |
| 일별 고유 방문자 | `dateKey` | — | `visit_events_dateKey_visitor` |

### 6.3 인덱스 목록 (제안)

| 컬렉션 | 인덱스 이름 | 키 | 옵션 | 목적 |
| --- | --- | --- | --- | --- |
| `profiles` | `singletonKey_unique` | `{ singletonKey: 1 }` | unique | 단일 문서 강제 |
| `projects` | `slug_unique` | `{ slug: 1 }` | unique | 상세 조회, 중복 방지 |
| `projects` | `projects_public_list` | `{ visibility: 1, sortOrder: 1, startedAt: -1, _id: -1 }` | | 기본 목록 정렬 |
| `projects` | `projects_skillIds` | `{ skillIds: 1, visibility: 1 }` | multikey | 기술 필터 |
| `skills` | `slug_unique` | `{ slug: 1 }` | unique | 필터·조회 |
| `skills` | `name_unique_ci` | `{ name: 1 }` | unique, collation `{ locale: "en", strength: 2 }` | 대소문자 무시 중복 방지 |
| `skills` | `skills_public_list` | `{ visibility: 1, category: 1, sortOrder: 1 }` | | 카테고리별 목록 |
| `study_records` | `slug_unique` | `{ slug: 1 }` | unique | |
| `study_records` | `study_records_public_list` | `{ visibility: 1, learnedAt: -1, _id: -1 }` | | 기본 목록 정렬 |
| `study_records` | `study_records_skillIds` | `{ skillIds: 1 }` | multikey | 기술 필터, 기술 삭제 시 참조 확인 |
| `study_records` | `study_records_projectIds` | `{ projectIds: 1 }` | multikey | 관련 학습 기록, 프로젝트 삭제 시 `$pull` |
| `admins` | `email_unique` | `{ email: 1 }` | unique | 로그인 |
| `inquiries` | `inquiries_status_createdAt` | `{ status: 1, createdAt: -1 }` | | 상태별 목록 |
| `inquiries` | `inquiries_createdAt` | `{ createdAt: -1 }` | | 전체 목록 |
| `inquiries` | `inquiries_contentHash` | `{ contentHash: 1, createdAt: -1 }` | | 중복 제출 탐지 |
| `inquiries` | `inquiries_ttl` | `{ expiresAt: 1 }` | `expireAfterSeconds: 0` | 자동 파기 |
| `visit_events` | `dedupKey_unique` | `{ dedupKey: 1 }` | unique | 30분 내 중복 페이지뷰 차단 |
| `visit_events` | `visit_events_ttl` | `{ occurredAt: 1 }` | `expireAfterSeconds: 7776000` (90일) | 자동 파기 |
| `visit_events` | `visit_events_dateKey_path` | `{ dateKey: 1, path: 1 }` | | 일별·경로별 집계 |
| `visit_events` | `visit_events_dateKey_visitor` | `{ dateKey: 1, visitorHash: 1 }` | | 일별 고유 방문자 집계 |
| `visit_daily_stats` | `dateKey_unique` | `{ dateKey: 1 }` | unique | 기간 조회, 중복 집계 방지 |
| `sessions` | `sessions_ttl` | `{ expires: 1 }` | `expireAfterSeconds: 0` | 만료 세션 자동 삭제 (connect-mongo 자동 생성은 끄고 `ensureAuthIndexes()`로 생성) |

- `tags`에는 인덱스를 두지 않는다(제안). 데이터 규모상 불필요하며, 필요해지면 `{ tags: 1, visibility: 1 }` 추가를 검토한다.
- **결정 (2단계):** 서버는 모든 환경에서 `autoIndex: false`, `autoCreate: false`로 연결하고 connect-mongo의 `autoRemove`도 끈다. 서버를 시작하는 것만으로는 Atlas에 컬렉션·인덱스가 생기지 않는다. 인덱스는 스크립트의 명시적 함수로만 만든다 (`admins`·`sessions`: `src/modules/auth/indexes.js`의 `ensureAuthIndexes()`, 관리자 생성 스크립트가 호출). 나머지 컬렉션 인덱스는 `scripts/sync-indexes.js`(`npm run db:sync-indexes`, 3단계)로 만든다. 이 스크립트는 위 표의 12개(모델 스키마 + `sessions_ttl`)를 기준으로 없는 인덱스만 만들고, 기존 인덱스를 삭제·변경하지 않으며, 이름·키가 같고 정의가 다른 인덱스가 있으면 중단한다.

### 6.4 검색 설계 (제안)

| 단계 | 방식 | 장점 | 한계 |
| --- | --- | --- | --- |
| **1단계 (제안)** | 이스케이프한 대소문자 무시 정규식으로 `title`, `summary`, `tags` 부분 일치 | 추가 인프라 없음, 한글 부분 일치 가능 | 인덱스를 사용하지 못함(전체 스캔), 관련도 정렬 없음 |
| 2단계 (대안) | Atlas Search + `lucene.korean`(Nori) 분석기 | 한글 형태소 분석, 관련도 점수 | 별도 Search 인덱스 관리, M0 무료 등급의 인덱스 수 제한 |
| 비추천 | MongoDB `$text` 인덱스 | 내장 기능 | 한국어 형태소 분석 미지원 ("리액트를" ≠ "리액트") |

- 검색어는 `RegExp` 특수문자를 반드시 이스케이프한다 (ReDoS·쿼리 조작 방지). 길이는 2~50자로 제한한다.
- 데이터가 1,000건 이하일 때는 1단계로 충분하다고 판단한다.

---

## 7. 개인정보 및 데이터 보관 정책 (제안)

| 데이터 | 개인정보 포함 | 보관 기간 | 삭제 방식 | 근거 |
| --- | --- | --- | --- | --- |
| `profiles` | 소유자 본인 정보 (공개 의도) | 영구 | 관리자 수정 | 공개 목적 |
| `projects`, `skills`, `study_records` | 없음 (본문에 개인정보 작성 금지) | 영구 | 관리자 삭제 | 포트폴리오 콘텐츠 |
| `admins` | 이메일, 비밀번호 해시 | 계정 존재 기간 | 수동 | 인증 |
| `sessions` | 관리자 ID | 세션 만료 시 (유휴 2시간 / 최대 12시간, 제안) | TTL 자동 | 인증 상태 유지 |
| `inquiries` | 이름, 이메일, 문의 내용 | **접수 후 180일 (기본안)** | TTL 자동 + 관리자 즉시 삭제 가능 | 회신 목적 달성 후 불필요 |
| `visit_events` | 직접 식별 정보 없음 (일별 회전 해시) | **90일** | TTL 자동 | 통계 정확도 검증 기간 |
| `visit_daily_stats` | 없음 (집계값) | 영구 | — | 장기 추이 |

### 7.1 수집하지 않는 정보

- 방문자: IP 원문, User-Agent 원문, 쿠키 기반 방문자 ID, 정밀 위치, 핑거프린트
- 문의자: IP, 전화번호, 소속, 첨부파일
- 관리자: 로그인 IP·기기 기록

### 7.2 운영 규칙

- TTL 삭제는 MongoDB 백그라운드 작업(약 60초 주기)으로 수행되므로 만료 시각 직후 수 분까지 문서가 남을 수 있다. API는 만료 여부를 별도로 판단하지 않는다.
- 애플리케이션 로그에 문의 본문, 이메일, 비밀번호, 세션 ID를 기록하지 않는다. 호스팅 플랫폼의 접근 로그(IP 포함)는 플랫폼 정책을 따르며 별도로 확인이 필요하다 (미정).
- **백업:** Atlas M0는 자동 백업을 제공하지 않는다. 콘텐츠 컬렉션(`profiles`, `projects`, `skills`, `study_records`)의 수동 내보내기 절차가 필요하며, 백업에는 `inquiries`, `visit_events`를 포함하지 않는다 (미정).
- 샘플·테스트 데이터에는 실제 개인정보나 비밀값을 넣지 않는다 (`CLAUDE.md` 5.1).

---

## 8. 초기 데이터 (제안, 구현은 승인 후)

- 관리자 계정은 초기화 스크립트가 환경변수(`ADMIN_EMAIL`)와 실행 시 입력받은 비밀번호로 1회 생성한다. 비밀번호를 환경변수나 파일에 평문으로 남기지 않는 방식을 우선 검토한다.
- **프로필은 관리자 API `PUT /admin/profile`로만 생성한다** (유일한 생성 경로). 필수 필드(`name`, `headline`)가 있어 빈 기본 문서는 만들지 않는다.
- 단일 문서 보장은 `singletonKey_unique` 인덱스에 의존한다. 인덱스 없이 동시 생성하면 문서가 여러 개 생길 수 있음을 메모리 DB 실험으로 확인했다(2026-10-16: 5건 동시 요청 20회 모두 중복 발생, 인덱스가 있으면 0회). 첫 `PUT` 전에 인덱스를 동기화한다.

---

## 9. 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-10-15 | v0.1 | 최초 초안 작성 (검토 대기) |
| 2026-10-15 | v0.2 | 기본안 반영: Argon2id·세션·Zod·HMAC 일별 키·180일, 기술 slug 길이, 비밀번호 변경 시 세션 규칙 |
