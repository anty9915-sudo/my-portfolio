# FRONTEND.md — 프론트엔드 구현 기준

> **문서 상태: v0.1 (2026-10-17) — 1차 구현 완료**
>
> - 디자인 기준: `docs/img/` 15장(Pen 시안). 배경 일러스트는 Pen 원본 8장을 WebP로 변환해 `frontend/src/assets/scenes/`에 두었다.
> - API 계약은 [`API.md`](./API.md) v0.2를 그대로 따른다. 이번 작업에서 백엔드 코드·DB 스키마·API 명세는 바꾸지 않았다.

---

## 1. 기술 구성

| 항목 | 결정 | 비고 |
| --- | --- | --- |
| 프레임워크 | 기존 Vite 8 + React 19 | 새 패키지 설치 없음 |
| 라우팅 | History API 기반 자체 라우터 (`src/lib/router.jsx`, `routerCore.js`) | `react-router-dom` 미설치 |
| 다국어 | 자체 컨텍스트 + `src/i18n/ko.json`·`en.json` | 기본 한국어, 선택값은 `localStorage`(`portfolio.lang`) |
| 스타일 | 전역 CSS + 디자인 토큰 (`src/index.css`, `src/styles/*.css`) | 관리자 CSS는 관리자 번들에만 포함 |
| 아이콘 | 인라인 SVG (`src/common/Icon.jsx`) | 아이콘 라이브러리 미설치 |
| 글꼴 | Google Fonts 링크 (Noto Serif KR · Noto Sans KR · Oswald · IBM Plex Mono) | `index.html` |
| Markdown | 자체 파서 (`src/lib/markdown.js`) → React 요소로만 렌더링 | HTML 문자열 삽입 없음 |
| 관리자 화면 | `React.lazy`로 분리 로드 | 방문자 번들에 미포함 |

## 2. 폴더 구조

```text
frontend/src/
├── App.jsx            # 라우트, 스크롤, 방문 기록(POST /visits)
├── site/              # 공통 레이아웃: 헤더 · 모바일 메뉴 · 푸터 · 프로필 컨텍스트
├── sections/          # Hero · About · Skills · Projects · Study · Contact
├── pages/             # 홈 · 프로젝트 상세 · 학습 기록 목록/상세 · 404
├── admin/             # 로그인 · 레이아웃 · 대시보드 · 프로젝트 · 기술 · 학습 · 문의 · 통계 · 프로필/계정
├── services/api.js    # API 호출 계층 (화면과 분리)
├── i18n/              # ko.json · en.json 번역 데이터
├── common/            # 버튼·입력 · 상태 화면 · 토스트 · 모달 · 아이콘 · Markdown
├── hooks/ lib/ styles/ assets/scenes/
```

## 3. 개발 실행

```bash
cd backend && npm run dev      # API: http://localhost:3000 (backend/.env 필요)
cd frontend && npm run dev     # 화면: http://localhost:5173
```

- Vite 개발 서버가 `/api`를 `http://localhost:3000`으로 프록시한다 (`VITE_API_PROXY_TARGET`으로 변경 가능).
  같은 출처로 요청하므로 세션 쿠키가 동작하고, 브라우저가 보낸 `Origin`(5173)이 그대로 전달되어 백엔드 Origin 검증을 통과한다.
- 배포 시 API 주소가 다르면 빌드 환경변수 `VITE_API_BASE_URL`(기본 `/api/v1`)을 지정한다. 다른 도메인이면 세션 쿠키 정책을 먼저 정해야 한다 (`DESIGN_REVIEW.md` U-01, 미정).
- 백엔드 `CLIENT_ORIGIN`은 프론트엔드 주소와 정확히 같아야 한다 (개발: `http://localhost:5173`).

## 4. 화면 ↔ API 연결

| 화면 | API |
| --- | --- |
| 메인 히어로·소개·연락처 카드·푸터 | `GET /profile` (404면 "프로필 미등록" 안내 + 기본 소개 문구) |
| 소개(학습 중), 기술 스택, 프로젝트 기술 필터 | `GET /skills` |
| 프로젝트 목록 (검색·기술 필터·정렬·더 보기) | `GET /projects?q&skill&sort&page&limit` |
| 프로젝트 상세 · 다음 프로젝트 | `GET /projects/:slug`, `GET /projects?limit=50` |
| 학습 기록 (홈 4건, 목록, 상세) | `GET /study-records`, `GET /study-records/:slug` |
| 문의 폼 | `GET /inquiries/form-token` → `POST /inquiries` (202일 때만 성공 표시) |
| 방문 기록 | 공개 화면 경로 진입 시 `POST /visits` (관리자 화면 제외) |
| 관리자 로그인·로그아웃·세션 확인 | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| 비밀번호 변경 | `PATCH /auth/password` |
| 프로필 편집 | `PUT /admin/profile` (전체 교체) |
| 프로젝트 관리 | `GET/POST/PATCH/DELETE /admin/projects` (공개 토글·순서 변경은 PATCH) |
| 기술 스택 관리 | `GET/POST/PATCH/DELETE /admin/skills`, 409 시 `GET /admin/skills/:id`의 `usage` 표시 |
| 학습 기록 관리 | `GET/POST/PATCH/DELETE /admin/study-records` |
| 문의 관리 | `GET /admin/inquiries`, `GET/PATCH/DELETE /admin/inquiries/:id` |
| 대시보드 · 방문 통계 | 위 목록 API의 `meta.totalItems`, `GET /admin/stats/visits` |

- 관리자 API가 401 `UNAUTHENTICATED`를 돌려주면 "로그인이 만료되었습니다" 대화 상자를 띄우고 로그인 화면으로 보낸다. 로그인·비밀번호 확인 실패(401 `INVALID_CREDENTIALS`)는 해당 입력칸 오류로 표시한다.
- 수정(PATCH)은 바뀐 필드만 보낸다. 서버 검증 오류(`details`)는 해당 입력칸에 표시한다.
- 문의 폼은 서버의 "발급 후 3초 미만 제출은 저장하지 않음" 규칙에 정상 사용자가 걸리지 않도록, 토큰 발급 후 3.2초가 지나기 전이면 그만큼 기다렸다가 보낸다.

## 5. 디자인에는 있지만 현재 API로 지원하지 않는 기능

아래 항목은 **구현 완료로 표시하지 않으며**, 화면에서도 실제 기능처럼 보이지 않게 처리했다. 지원하려면 백엔드·DB·API 명세 변경이 필요하다 (승인 필요).

| 디자인 요소 | 현재 처리 |
| --- | --- |
| 콘텐츠 한국어·영어 동시 관리 (프로젝트 편집의 KO/EN 탭) | UI 문구만 한·영 전환. 프로필·프로젝트·학습 기록 **내용은 저장된 언어 하나로** 표시 |
| 프로젝트 진행 상태 (개발 진행 중 / 기획 단계 / 설계 단계) 및 상태 필터 | `endedAt` 유무로 "진행 중 / 완료"만 표시, 상태 필터 없음 |
| 프로젝트 부제 | 별도 필드 없음 → 태그를 부제처럼 표시 (`중고거래-플랫폼` → "중고거래 플랫폼") |
| 기능별 구현/계획 표시, 문제·해결 카드, 트러블슈팅 케이스, 기술 의사결정 카드 | 구조화 필드 없음 → `description`(Markdown)의 `##` 제목으로 섹션·목차를 만들고 `highlights`는 "주요 성과" 카드로 표시 |
| 대표 이미지 업로드 (끌어다 놓기) | 업로드 API 없음 → https 이미지 URL 입력 + 미리보기. 비우면 콘셉트 아트 표시 |
| 학습 기록 썸네일 | 필드 없음 → 서재 일러스트를 장식으로 표시 |
| 임시 저장 | 별도 상태 없음 → "비공개 = 초안"(DATABASE.md 3장) |
| 관리자 "아이디" 로그인, 로그인 상태 유지, 비밀번호 찾기 | API는 이메일 로그인만 지원 → 이메일로 표시, 나머지 미구현 |
| 관리자 상단 검색·알림 버튼 | 대응 API 없음 → 표시하지 않음 (새 문의 수는 사이드바 배지로 표시) |
| 통계 카드의 증감률(+8.2% 등), 누적 전체 방문 | 응답에 없음 → 기간 페이지뷰·일별 고유 방문자 합계·일 평균·오늘 페이지뷰 표시 |
| 문의 상태 "대기 / 처리 중 / 완료" | API 값 `new / read / replied / archived` → "새 문의 / 확인함 / 회신 완료 / 보관" |
| 기술 상태 게이지 세부 조정 | 상태 4단계(`planned 1 · learning 2 · applied 3 · proficient 4`/5칸)로만 표시 |
| 기술 열 안의 정렬 (HTML·CSS·JavaScript·React) | 공개 응답에 `sortOrder`가 없어 서버 정렬(분류 → 순서 → 이름)을 따름. `language` 분류는 FRONTEND 열 뒤쪽에 표시 |

## 6. 디자인에 없지만 API에 맞춰 추가한 화면

- 관리자 **대시보드**: 시안에 메뉴만 있고 화면이 없어 개수·최근 7일 방문·최근 문의로 구성했다.
- 관리자 **프로필·계정**: 공개 화면의 이름·소개·연락처를 채울 경로가 `PUT /admin/profile`뿐이라 추가했다. 비밀번호 변경(`PATCH /auth/password`) 포함.
- **학습 기록 목록·상세 페이지** (`/study`, `/study/:slug`): 홈의 "학습 기록 더 보기"와 각 기록의 이동 대상.

## 7. 알려진 한계 · 미정

- 관리자 화면은 한국어로 고정했다 (시안도 한국어만 제공).
- 다크 모드 전용 디자인이라 라이트 모드 전환은 없다 (`CLAUDE.md`의 "다크 모드(클라이언트 전용)" 범위는 기본 다크 테마로 충족).
- 프론트엔드 자동 테스트 도구는 승인 전이라 추가하지 않았다. 검증은 빌드·린트와 브라우저 수동 확인으로 했다.
- OneDrive 동기화 폴더에서는 Vite 파일 감시가 변경을 놓칠 수 있다. 화면이 이상하면 개발 서버를 다시 시작한다 (필요하면 `server.watch.usePolling` 검토).
