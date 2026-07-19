# 생활체육 리그/랭킹 관리 플랫폼 개발 로드맵

사설 체육관의 수기 대진표 작성과 점수 계산을 디지털화해 대회 운영을 자동화하는 구장 전용 리그/랭킹 관리 플랫폼.

## 개요

생활체육 리그/랭킹 관리 플랫폼은 탁구/테니스 동호회 회원과 구장 운영자를 위한 대회 자동화 서비스로 다음 기능을 제공합니다:

- **구장(클럽) 운영**: 초대코드 기반으로 구장 공간을 생성하고 회원을 모집
- **대회 생성 및 참가자 관리**: 대회를 만들고 참가 신청/승인을 관리
- **자동 대진표 생성**: 풀리그/토너먼트 형식에 맞춰 대진표를 자동 생성
- **경기 점수 입력 및 자동 진행**: 점수 입력만으로 승패 판정과 다음 라운드 진출을 자동 처리
- **ELO 기반 랭킹**: 경기 결과마다 레이팅이 자동 갱신되는 구장별 순위표

## 개발 워크플로우

1. **작업 계획**
   - 기존 코드베이스를 학습하고 현재 상태를 파악
   - 새로운 작업을 포함하도록 `ROADMAP.md` 업데이트
   - 우선순위 작업은 마지막 완료된 작업 다음에 삽입

2. **작업 생성**
   - `docs/PRD.md`의 기능 명세(F001~F022)를 기준으로 Task를 분해
   - 고수준 명세서, 관련 파일, 수락 기준, 구현 단계 포함
   - API/비즈니스 로직 작업 시 Playwright MCP 테스트 시나리오를 Task 내에 명시

3. **작업 구현**
   - Task의 명세를 따라 기능 구현
   - API 연동 및 비즈니스 로직 구현 시 Playwright MCP로 E2E 테스트 수행
   - 각 단계 후 본 문서의 진행 상황 업데이트
   - 각 단계 완료 후 중단하고 추가 지시를 기다림

4. **로드맵 업데이트**
   - 로드맵에서 완료된 작업을 ✅로 표시

## 개발 단계

### Phase 1: 애플리케이션 골격 구축 ✅

- **Task 001: 클럽/대회/랭킹 라우트 구조 및 빈 페이지 생성** ✅ - 완료
  - ✅ `app/(dashboard)/` 라우트 그룹으로 `app/protected/` 대체, 내 클럽 페이지 골격 생성
  - ✅ `app/c/[clubSlug]/` 하위에 클럽 홈, 멤버 관리, 대회 목록, 대회 상세, 대진표, 랭킹 빈 페이지 생성
  - ✅ 클럽 생성/클럽 가입 페이지 골격 생성
  - ✅ 클럽 진입 레이아웃(로그인 게이트) 및 클럽 메뉴 골격 컴포넌트(`components/club-nav.tsx`) 배치 (기존 `app/protected/layout.tsx`의 nav 패턴 재사용)

- **Task 002: 도메인 타입 및 데이터베이스 스키마 설계** ✅ - 완료
  - ✅ `docs/PRD.md` 데이터 모델(clubs, club_members, tournaments, tournament_participants, matches, match_games, club_ratings, rating_history) 기반 TypeScript 인터페이스 정의 (`lib/types/domain.ts`)
  - ✅ Supabase 마이그레이션 스키마 설계 문서화 (`docs/schema-design.md` — 컬럼/FK/RLS 정책 방향/인덱스, 구현은 Task 005~008에서)
  - ✅ Server Action/RPC 요청·응답 타입 정의 (`lib/types/actions.ts`)

### Phase 2: UI/UX 완성 (더미 데이터 활용) ✅

- **Task 003: 공통 컴포넌트 라이브러리 구현** ✅ - 완료
  - ✅ shadcn/ui 신규 컴포넌트 설치 (`dialog`, `select`, `table`, `tabs`, `form`, `avatar`, `separator`, `sonner`)
  - ✅ 클럽 카드, 대회 카드, 순위표, 대진표/브래킷 표시, 참가자 목록 도메인 공통 컴포넌트 구현 (`components/{club-card,tournament-card,ranking-table,bracket-view,participant-list}.tsx`)
  - ✅ 클럽/대회/참가자/경기/랭킹 더미 데이터 생성 유틸리티 작성 (`lib/dummy-data.ts`)

- **Task 004: 전체 페이지 UI 완성 (더미 데이터 사용)** ✅ - 완료
  - ✅ 내 클럽, 클럽 생성, 클럽 가입, 클럽 홈, 멤버 관리 페이지 UI 구현 (F001, F002, F003, F021, F022)
  - ✅ 대회 목록, 대회 상세, 대진표 페이지 UI 구현 (F004, F005, F006, F007, F008)
  - ✅ 랭킹 페이지 UI 구현 (F009, F010)
  - ✅ 반응형 그리드(Tailwind 브레이크포인트) 적용. 실제 브라우저 네비게이션 검증은 인증 게이트(Suspense) 구조상 실 로그인 세션이 필요해 Task 005 이후로 이월

### Phase 3: 핵심 기능 구현 ✅

- **Task 005: 클럽(구장) 도메인 백엔드 구현** ✅ - 완료
  - ✅ `clubs`, `club_members` 테이블 및 RLS 마이그레이션 적용 (Supabase MCP `apply_migration`)
  - ✅ 클럽 생성, 초대코드 발급, 초대코드로 가입 Server Action + `join_club_with_code` RPC 구현 (F001, F002)
  - ✅ 멤버 목록 조회 및 역할(관리자/일반 멤버) 변경 기능 구현 (F003)
  - ✅ Playwright MCP로 "클럽 생성 → 다른 계정으로 초대코드 가입 → 멤버 관리" E2E 테스트

- **Task 006: 대회/참가자 도메인 백엔드 구현** ✅ - 완료
  - ✅ `tournaments`, `tournament_participants` 테이블 및 RLS 구현
  - ✅ 대회 생성, 참가 신청/승인, 참가 등록 마감 Server Action 구현 (F004, F005)
  - ✅ Playwright MCP로 "대회 생성 → 참가 신청 → 등록 마감" E2E 테스트

- **Task 007: 대진표 생성 및 경기 진행 엔진 구현** ✅ - 완료
  - ✅ `matches`, `match_games` 테이블 및 RLS 구현
  - ✅ `lib/tournament/bracket.ts`에 풀리그(서클법) 대진표 생성 로직 구현 (F006)
  - ✅ 점수 입력 UI 및 `record_match_result` RPC로 승패 자동 판정 구현 (F007)
  - ✅ 싱글 엘리미네이션 대진표 생성 및 승자 다음 라운드 자동 배정 구현 (F006, F008)
  - ✅ Playwright MCP로 "대진표 생성 → 점수 입력 → 라운드 진행 → 대회 완료" E2E 테스트

- **Task 008: ELO 랭킹 엔진 구현** ✅ - 완료
  - ✅ `club_ratings`, `rating_history` 테이블 및 RLS 구현
  - ✅ `lib/rating/elo.ts` ELO 계산 로직 구현 및 `record_match_result`에 통합 (F009)
  - ✅ 랭킹 페이지에 실제 순위표/레이팅 추이 데이터 연동 (F010)
  - ✅ Playwright MCP로 "경기 완료 → 레이팅 갱신 → 랭킹 페이지 반영" E2E 테스트

- **Task 008-1: 핵심 기능 통합 테스트** ✅ - 완료
  - ✅ Playwright MCP로 전체 사용자 플로우(회원가입 → 클럽 생성/가입 → 대회 생성/참가 → 대진표 진행 → 랭킹 확인) 테스트
  - ✅ 관리자/일반 멤버 권한 기반 접근 제어 검증 (RLS 및 UI 양쪽)
  - ✅ 에러 핸들링 및 엣지 케이스(참가자 홀수 인원 부전승, 등록 마감 전 대진표 생성 시도 등) 테스트 — 부전승 처리와 조기 대진표 생성 모두 의도된 설계로 확인. 통합 테스트 중 클럽 홈(`app/c/[clubSlug]/page.tsx`)이 더미 데이터에 남아 멤버십 접근 제어가 동작하지 않던 버그를 발견해 함께 수정

### Phase 4: 고급 기능 및 최적화

- **Task 009: 더블 엘리미네이션 및 대회 운영 고도화** ✅ - 완료
  - ✅ `bracket` 컬럼(winners/losers)을 활용한 더블 엘리미네이션 대진표 지원(그랜드파이널은 단일 경기로 확정, bracket reset 없음)
  - ✅ 대회 취소, 참가자 실격/기권 등 예외 운영 기능
  - ✅ Playwright MCP로 더블 엘리미네이션 진행 E2E 테스트

- **Task 010: 성능 최적화 및 배포 준비** - 진행 중
  - ✅ `club_id` 기반 인덱스 점검, Supabase `get_advisors`로 RLS/성능 경고 점검(FK 인덱스 8개 추가, RLS `auth_rls_initplan` 7건 최적화, 중복 permissive 정책 1건 병합 — 판정 로직 불변 확인)
  - Vercel 배포 파이프라인 구성 및 환경변수 관리 (사용자 Vercel 계정 연동 필요, 다음 호출 이후 진행)
  - 모니터링/로깅 체계 구성 (범위 확정 필요, 다음 호출 이후 진행)

## 참고

- Phase 4 이후(핸디캡 자동화, 커뮤니티 게시판, 코치 레슨 예약, 구독/결제, 구장 예약)는 `docs/PRD.md`의 "MVP 이후 기능"에 해당하며, 본 로드맵의 스키마가 재작업 없이 확장 가능함을 설계 단계에서 확인함.

---

**📅 최종 업데이트**: 2026-07-18
**📊 진행 상황**: Phase 4 진행 중 (10/11 Tasks 완료, Task 010은 부분 완료)
