# Developer Portfolio

웹 개발 및 웹 보안 분야의 학습 과정과 프로젝트 경험을 정리하기 위한 개인
개발자 포트폴리오입니다.

백엔드(Express + MongoDB)와 Pen 시안 기반 프론트엔드(Vite + React)가
REST API로 연동됩니다. 프론트엔드 기준은 `docs/FRONTEND.md`를 따릅니다.

## 프로젝트 목표

-   자기소개와 개발 목표 소개
-   기술 스택 및 학습 상태 정리
-   프로젝트 목록과 상세 경험 기록
-   학습 과정에서 해결한 문제와 배운 점 기록
-   MongoDB에 저장된 데이터를 REST API로 조회
-   추후 프론트엔드와 API를 통해 연동

## 기술 스택

  -----------------------------------------------------------------------
  영역                    기술                    상태
  ----------------------- ----------------------- -----------------------
  백엔드                  Node.js + Express       사용 예정

  데이터베이스            MongoDB Atlas           사용 예정

  ODM                     Mongoose                사용 예정

  API                     REST + JSON             사용 예정

  프론트엔드              Vite + React 19         1차 구현 (Pen 시안 기준,
                                                  `docs/FRONTEND.md`)
  -----------------------------------------------------------------------

> 세부 버전과 라이브러리는 실제 개발 환경을 확인한 뒤 확정합니다. 확정된
> 프로젝트 규칙은 `CLAUDE.md`를 기준으로 합니다.

## 주요 기능 계획

-   **프로필:** 이름, 소개, 개발 목표 및 링크
-   **프로젝트:** 프로젝트 설명, 담당 역할, 기술 스택, GitHub 및 배포
    링크
-   **기술 스택:** 기술 분류와 학습 상태
-   **학습 기록:** 학습 주제, 정리 내용, 문제 해결 과정
-   **관리 기능:** 관리자 로그인(서버 세션 + HttpOnly 쿠키)과 콘텐츠 CRUD
-   **검색·필터·페이지네이션:** 프로젝트·학습 기록 목록 검색과 필터
-   **방문 통계:** IP를 저장하지 않는 일별 방문 통계 대시보드
-   **연락 폼:** 스팸 방지가 적용된 방문자 문의 (180일 후 자동 삭제)
-   **다크 모드:** 프론트엔드에서만 관리 (서버 저장 없음)

설계는 `docs/`의 문서를 기준으로 하며, 백엔드 MVP는
`docs/BACKEND_PLAN.md`의 순서대로 구현합니다.

## 디렉터리 구조

``` text
my-proplie/                # 프로젝트 루트
├── CLAUDE.md
├── README.md
├── .gitignore
├── docs/                  # DATABASE, API, DESIGN_REVIEW, BACKEND_PLAN, FRONTEND, img/(시안)
├── backend/               # Express API (1단계 골격, .env는 여기에)
└── frontend/              # Vite + React 포트폴리오 화면 (docs/FRONTEND.md)
```

상세 구조는 `CLAUDE.md` 3장을 따릅니다.

## 시작하기

백엔드는 1단계(기본 서버·DB 연결 구조)까지 구현되어 있습니다.

``` bash
cd backend
npm install
npm run dev        # backend/.env 필요 (backend/.env.example 참고)
npm test           # 메모리 MongoDB 사용, Atlas에 연결하지 않음
npm run admin:create   # 최초 관리자 1명 생성 (PowerShell/cmd에서 직접 실행)
npm run db:sync-indexes -- --dry-run   # 인덱스 생성 계획만 확인 (읽기 전용)
npm run db:sync-indexes                # 없는 인덱스만 생성 (yes 확인 후)
```

프론트엔드 (백엔드 개발 서버를 먼저 실행):

``` bash
cd frontend
npm install
npm run dev        # http://localhost:5173 — /api 요청은 http://localhost:3000으로 프록시
npm run lint
npm run build
```

> 백엔드 `CLIENT_ORIGIN`은 프론트엔드 주소(개발: `http://localhost:5173`)와 같아야
> 로그인·문의·방문 기록 요청이 Origin 검증을 통과합니다.

MongoDB 연결을 위해서는 MongoDB Atlas 클러스터와 데이터베이스 사용자를
준비하고, 연결 문자열을 환경변수로 설정해야 합니다. 실제 연결 문자열이나
비밀번호를 코드 또는 Git 저장소에 올리지 마세요.

## 환경변수

`backend/.env`에 설정합니다. 필수 여부와 설명은 `CLAUDE.md` 7.1을 따릅니다.

``` dotenv
NODE_ENV=development
PORT=3000
MONGODB_URI=            # DB 이름을 경로에 포함
CLIENT_ORIGIN=
SESSION_SECRET=
VISIT_HASH_SECRET=
FORM_TOKEN_SECRET=
TRUST_PROXY=false
ADMIN_EMAIL=            # 관리자 계정 생성 스크립트 전용
DNS_SERVERS=            # 선택: querySrv ECONNREFUSED가 날 때만 해당 PC의 DNS IP
```

-   실제 값은 로컬 `.env` 또는 배포 환경의 비밀정보 설정에 보관합니다.
-   `.env` 파일은 커밋하지 않습니다.
-   `.env.example`에는 변수 이름만 기록하고 실제 비밀값은 포함하지
    않습니다.

## 문서

  -----------------------------------------------------------------------
  파일                                설명
  ----------------------------------- -----------------------------------
  `CLAUDE.md`                         프로젝트 기준, 기술 원칙, 보안 및
                                      Claude Code 작업 규칙

  `docs/DATABASE.md`                  MongoDB 컬렉션과 데이터 모델 설계

  `docs/API.md`                       REST API 엔드포인트, 요청·응답 규약

  `docs/DESIGN_REVIEW.md`             설계 결정의 근거, 대안, 미정 사항

  `docs/BACKEND_PLAN.md`              백엔드 MVP 구현 단계와 승인 시점

  `docs/FRONTEND.md`                  프론트엔드 구조, 화면-API 연결,
                                      API 미지원 시안 요소

  `docs/DEPLOY.md`                    배포 구성(Vercel + Render + Atlas)과
                                      순서
  -----------------------------------------------------------------------

`docs/` 문서는 초안(v0.2) 상태입니다.

## 개발 진행 순서

1.  프로젝트 요구사항과 `CLAUDE.md` 검토
2.  `README.md` 및 폴더 구조 확인
3.  MongoDB 컬렉션과 검증 규칙 설계
4.  REST API 계약 설계
5.  백엔드 기본 구조 및 MongoDB 연결 구현
6.  API 테스트
7.  ~~Pen 기반 프론트엔드 제작 및 연동~~ (1차 완료, 2026-10-17)
8.  배포

## 개발 원칙

-   확정되지 않은 기술이나 기능을 임의로 추가하지 않습니다.
-   패키지 설치·백엔드/DB 변경은 사전 승인 후 진행합니다.
-   데이터 모델이나 API가 변경되면 관련 문서를 함께 갱신합니다.
-   환경변수와 비밀정보를 소스 코드에 하드코딩하지 않습니다.
-   Git commit, push 및 배포는 명시적인 요청이 있을 때만 수행합니다.
