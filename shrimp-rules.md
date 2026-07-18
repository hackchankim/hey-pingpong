# 개발 가이드라인 (AI 에이전트 전용)

> 이 문서는 이 저장소에서 작업하는 **코딩 에이전트의 운영 규칙**이다. 일반 개발 지식은 담지 않는다. 이 프로젝트 고유의 "무엇을 어디에, 어떻게 수정/추가하는가"와 **금지 사항**만 명령형으로 기술한다. 모든 응답과 문서는 **한국어**로 작성한다.

## 프로젝트 개요

- 스택: **Next.js 16 App Router(Cache Components 활성화) · React 19 · TypeScript 5 · @supabase/ssr · shadcn/ui(new-york, base=neutral) · Tailwind CSS v3.4 · lucide-react**
- 제품: **생활체육(탁구/테니스) 동호회 리그·랭킹 관리 플랫폼**. 사설 체육관의 수기 대진표·점수 계산·핸디캡 부여를 디지털화한다. 단일 Supabase 프로젝트 + `club_id` 기반 RLS로 구장(클럽)을 격리하는 멀티테넌트 구조.
- **MVP 범위 = 구장(클럽) 운영 + 대회/대진표 자동 생성 + ELO 기반 랭킹**. 핸디캡 자동화·커뮤니티 게시판·코치 레슨 예약·구독 결제는 명시적으로 범위 밖(2단계 이후) — 스키마가 이를 가로막지 않도록 설계됨.
- 제품 명세의 단일 진실 소스는 **`docs/PRD.md`(기능 ID F001~F022)**와 **`docs/ROADMAP.md`(Phase 1~4 · Task 001~010)** 이다. 이와 별개로 **자율 개발 인프라**(Phase 0, 아래 "자율 개발 워크플로우 규칙" 참고)가 공존하며 `docs/autonomous-dev.md`가 단일 진입점이다.
- 테스트 프레임워크는 없다. 런타임 검증은 **Playwright MCP**로 수행한다.

## 디렉터리 구조 규칙

- 라우트/페이지/레이아웃/Route Handler는 **`app/`** 아래에만 둔다.
- 인증 라우트(`app/auth/**`)는 스타터에서 이미 구현되어 있으므로 재구현하지 않고 그대로 재사용한다.
- `app/protected/**`는 Task 001에서 삭제되고 아래 구조로 대체 완료됨(더 이상 존재하지 않음). 새 도메인 라우트는 **반드시** 이 위치에만 생성한다:
  - `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/clubs/new/page.tsx`, `app/(dashboard)/clubs/join/page.tsx` — 내 클럽/클럽 생성/가입. 인증 게이트는 `app/(dashboard)/layout.tsx`에 있다.
  - `app/c/[clubSlug]/**` — 클럽 스코프 라우트: `layout.tsx`(로그인 게이트 + 클럽 nav), `page.tsx`(클럽 홈), `members/page.tsx`, `tournaments/page.tsx`, `tournaments/[tournamentId]/page.tsx`, `tournaments/[tournamentId]/bracket/page.tsx`, `ranking/page.tsx`.
  - 두 레이아웃 모두 `cookies()`/`getClaims()`/동적 `params` 접근을 `<Suspense>` 경계 안 비동기 컴포넌트로 묶는 패턴을 따른다(아래 "Cache Components 규칙" 참고). 새 인증 게이트 레이아웃을 추가할 때도 동일 패턴을 재사용한다.
- 공유 기능 컴포넌트는 **`components/`** 루트에 둔다 (예: `login-form.tsx`). 클럽/대회/랭킹 도메인 컴포넌트는 kebab-case로 동일 위치에 추가한다(예: `club-card.tsx`, `bracket-view.tsx`).
- shadcn/ui 프리미티브는 **`components/ui/`** 에만 둔다. 이 폴더에 수기 컴포넌트를 직접 만들지 않는다.
- Supabase 클라이언트 팩토리는 **`lib/supabase/`** 3파일로 고정한다: `client.ts`, `server.ts`, `proxy.ts`.
- 대진표 생성·진행 알고리즘은 **`lib/tournament/bracket.ts`**(순수 함수, DB 접근 없음)에만 둔다. ELO 계산은 **`lib/rating/elo.ts`**에만 둔다.
- 공용 유틸은 **`lib/`** (`lib/utils.ts`의 `cn`), 생성 타입은 **`lib/types/database.types.ts`**.
- 자율 개발 인프라 신규 코드는 다음 위치에만 생성한다: `scripts/kakao/**`, `scripts/*.mjs|*.sh`, `.claude/hooks/**`, `.claude/commands/**`, `.claude/agents/**`, `.github/workflows/**`, `docs/decisions/**`.
- ✅ 새 페이지 → `app/<route>/page.tsx`. ❌ `pages/` 디렉터리(Pages Router) 생성 금지.

## Supabase 클라이언트 사용 규칙 (최우선)

상황에 따라 팩토리를 **반드시** 구분한다.

| 실행 위치 | 사용할 것 | 파일 |
|---|---|---|
| `"use client"` 컴포넌트 (브라우저) | `createClient()` (동기) | `lib/supabase/client.ts` |
| 서버 컴포넌트 · Route Handler · 서버 액션 | `await createClient()` (비동기, `cookies()` 사용) | `lib/supabase/server.ts` |
| 세션 갱신(proxy) | `updateSession(request)` | `lib/supabase/proxy.ts` |

- ✅ 서버에서 데이터 접근 시 매 함수 호출마다 `await createClient()`로 **새 인스턴스**를 만든다.
- ❌ **서버 클라이언트를 모듈 레벨 변수/전역에 저장 금지** (Fluid compute 요구사항). 신규 서버 헬퍼(향후 admin/service-role 클라이언트 포함)도 동일하게 적용한다.
- 환경변수는 항상 `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용한다. ❌ 키 하드코딩 금지.
- 클라이언트/서버 모두 제네릭 `createXxxClient<Database>`로 타입을 지정한다.

## 인증 / proxy 규칙

- 루트 진입점은 **`proxy.ts`** (Next.js proxy 파일)이며 `export async function proxy(...)` + `export const config.matcher`를 사용한다.
- ❌ `proxy.ts`를 `middleware.ts`로 바꾸거나 `proxy` 함수명·`config` 구조를 임의 변경 금지.
- `lib/supabase/proxy.ts`의 `updateSession`에서 **`createServerClient(...)` 호출과 `supabase.auth.getClaims()` 호출 사이에 다른 코드를 절대 삽입하지 않는다** (세션 무작위 로그아웃 유발).
- `updateSession`은 반드시 **`supabaseResponse`를 원형 그대로 반환**한다. 새 응답 객체를 만들면 쿠키를 그대로 복사한다.
- 미인증 리다이렉트 규칙: 경로가 `/`, `/login*`, `/auth*` 가 아니고 사용자가 없으면 `/auth/login`으로 리다이렉트. 클럽 초대 미리보기 등 새 공개 경로를 추가하려면 이 예외 목록도 함께 수정한다.

## Cache Components 규칙 (Next.js 16)

- `next.config.ts`에 `cacheComponents: true`가 설정되어 있다. 페이지·레이아웃에서 `cookies()`/`headers()`/Supabase 인증 호출·동적 라우트 `params`처럼 요청마다 달라지는("uncached") 값을 접근할 때는 **반드시 `<Suspense>` 경계 안에서** 접근한다. 위반 시 `npm run dev`에서는 드러나지 않고 **`npm run build`에서만** "Uncached data was accessed outside of `<Suspense>`" 오류로 실패한다 — 새 페이지/레이아웃 작업 후에는 `npm run build`까지 통과를 확인한다.
- 인증 게이트가 필요한 레이아웃은 `params` 접근과 `getClaims()` 호출을 **하나의 비동기 컴포넌트**로 묶고, 그 컴포넌트 전체를 `<Suspense>`로 감싼다(`app/(dashboard)/layout.tsx`, `app/c/[clubSlug]/layout.tsx` 패턴 재사용). `redirect()`는 이 컴포넌트 내부, 자식 렌더링 이전에 호출되므로 fallback 없는 `<Suspense>`를 써도 보호된 콘텐츠가 노출되기 전에 리다이렉트된다.
- ❌ 동적 데이터 접근을 레이아웃/페이지 최상단에 `<Suspense>` 없이 직접 두지 않는다.

## 멀티테넌시 / RLS 규칙 (도메인 핵심)

- 테넌트 엔티티는 **`clubs`**, 모든 테넌트 스코프 테이블은 **`club_id`** FK를 갖는다.
- `tournament_id`를 통해 `club_id`를 유도할 수 있는 테이블(`tournament_participants`, `matches`, `match_games`)에도 **`club_id`를 비정규화하여 직접 저장**한다 — RLS 정책을 조인 없이 인덱스 equality 체크로 유지하기 위함. 삭제·생략 금지.
- 신규 테넌트 테이블 생성 마이그레이션에는 **같은 마이그레이션에서 RLS를 즉시 활성화**한다. RLS 비활성 상태로 커밋/배포 금지.
- 클럽 가입처럼 역할·소유권이 걸린 쓰기는 **직접 INSERT 정책을 열지 않고 `SECURITY DEFINER` RPC**(예: `join_club_with_code`)로만 처리한다. 이런 RPC는 반드시 내부에서 `auth.uid()`로 신원을 재확인하고, 호출자가 넘긴 `user_id` 파라미터를 "누가 행동하는가"의 근거로 신뢰하지 않는다.
- RLS 정책 작성 시 반복 서브쿼리 대신 `is_club_member(club_id)` / `is_club_admin(club_id)` 헬퍼 함수를 재사용한다(신규 정책 추가 시에도 이 패턴을 따른다).

## 대진표 / 랭킹 로직 배치 규칙

- 대진표 형태 계산(풀리그 서클법, 엘리미네이션 트리 시딩·부전승 배치)은 **`lib/tournament/bracket.ts`의 순수 TypeScript 함수**로만 구현한다. Postgres 함수로 구현 금지.
- 대진표 확정 저장은 **`create_tournament_matches` RPC**로 원자적으로 처리한다(기존 draft 경기 삭제 → 벌크 insert → `tournaments.status` 전환을 한 트랜잭션에서).
- 점수 기록·경기 진행·레이팅 갱신처럼 **여러 테이블(`matches`, `match_games`, `club_ratings`, `rating_history`, `tournaments`)이 한 번에 일관되어야 하는 로직**은 **`record_match_result` Postgres RPC 하나**에 둔다. 이 로직을 애플리케이션 코드로 분산 구현 금지.
- ELO 계산 상수(K-factor, 초기 레이팅)는 `lib/rating/elo.ts`에 두되, 클럽별 초기 레이팅은 하드코딩하지 않고 `clubs.initial_rating` 컬럼을 참조한다.

## DB 스키마 변경 규칙 (다중 파일 동시 수정)

스키마를 바꿀 때는 **아래를 한 작업에서 모두** 수행한다.

1. `supabase/migrations/<타임스탬프>_<이름>.sql` 마이그레이션 작성·적용 (Supabase MCP `apply_migration` 사용, `project_ref=jxbcegkbuznwwcajoqdz`).
2. 타입 재생성: `npx supabase gen types typescript --project-id jxbcegkbuznwwcajoqdz > lib/types/database.types.ts` (또는 Supabase MCP `generate_typescript_types`).
3. 필요한 편의 타입(`Profile`/`ProfileInsert`/`ProfileUpdate`와 같은 형태로 `Club`/`Tournament`/`Match` 등)을 `lib/types/database.types.ts` 하단에 추가.

- ❌ **`lib/types/database.types.ts`를 손으로 편집 금지** — 반드시 재생성한다. (편의 타입 export 블록만 예외적으로 유지·추가)
- 신규 테넌트 테이블은 마이그레이션에서 RLS 활성화 + 정책을 함께 작성한다(위 "멀티테넌시 / RLS 규칙" 참고).

## UI 컴포넌트 규칙

- 새 shadcn 컴포넌트는 **`npx shadcn@latest add <component>`** 로 추가한다. ❌ `components/ui/`에 수기로 프리미티브 작성 금지.
- ROADMAP Task 003에서 필요한 컴포넌트: `dialog`, `select`, `table`, `tabs`, `form`, `avatar`, `separator`, `sonner`. 폼은 **react-hook-form + zod + @hookform/resolvers**로 구현한다(`docs/guides/forms-react-hook-form.md` 패턴, 미설치 시 먼저 `npm install`).
- Tailwind 클래스 병합은 항상 **`cn()`**(`@/lib/utils`)을 사용한다. ❌ 문자열 직접 결합 금지.
- 경로 별칭을 사용한다: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- 아이콘은 **lucide-react** 만 사용한다.
- 파일명 규칙: 모든 컴포넌트는 **kebab-case** (`login-form.tsx`, `club-card.tsx`, `bracket-view.tsx`).
- 대진표/점수 입력/랭킹 조회는 **Server Component + 작은 client island**(예: `ScoreEntryDialog`)로 구성한다. 목록·상세 조회에 `@tanstack/query` 등 신규 데이터 페칭 라이브러리를 도입하지 않는다 — Server Component 조회 + Server Action + `revalidatePath`로 충분하다.

## 문서 정합성 규칙 (다중 파일 동시 수정)

- 제품 기능을 추가/변경하면 **`docs/PRD.md`(기능 ID Fxxx)** 와 **`docs/ROADMAP.md`(Task)** 를 함께 갱신한다. 한쪽에만 존재하는 기능/페이지를 두지 않는다.
- PRD 내부 정합성: **기능 명세 ↔ 메뉴 구조 ↔ 페이지별 상세 기능**이 서로 참조되어야 한다(누락·고아 항목 금지). 새 기능 추가 시 세 섹션을 동시에 갱신한다.
- ROADMAP 태스크를 완료하면 **`docs:update-roadmap`** 커맨드로 해당 Task에 `✅` 표시하고 진행률을 갱신한다.
- ROADMAP 편집은 `.claude/agents/dev/development-planner.md`의 포맷을 따른다: `Task XXX: [동사]+[대상]`, 상태 표시(`- 우선순위` / `✅ - 완료`), API·비즈니스 로직 태스크는 Playwright MCP 테스트 시나리오를 Task 항목에 명시.

## Git / 커밋 규칙

- 커밋은 **`git:commit`** 커맨드 규약을 따른다: 이모지 + 컨벤셔널 커밋. ❌ **커밋 메시지에 Claude/AI 서명(Co-Authored-By 등) 추가 절대 금지**.
- ❌ `git add .`(전체 스테이징) 금지 — 의도한 파일만 스테이징한다.
- 푸시는 **`git:push`** 규약을 따른다: ❌ force push 금지, `main` 직접 push는 확인 후에만.
- 자율 에이전트는 **새 브랜치에 커밋 + PR 생성**만 한다. `main` 병합은 사람 승인.

## 시크릿 / 환경변수 규칙

- 비밀값은 **`.env.local`**(Supabase), **`.env.autodev.local`**(카카오 토큰)에만 둔다. 둘 다 `.gitignore`의 `.env*.local` 패턴으로 무시된다.
- ❌ 토큰·키를 코드/문서/커밋에 하드코딩 금지. GitHub 토큰은 `gh auth`(키체인)·GitHub Secrets 사용.
- 새 시크릿 파일을 도입하면 `.gitignore`에 명시적으로 추가하고, 커밋 전 스테이징에 시크릿이 없는지 확인한다.

## 자율 개발 워크플로우 규칙 (Phase 0 / shrimp)

- 개발 태스크 실행은 **Shrimp Task Manager** 흐름을 따른다: `docs/ROADMAP.md`에서 현재 Phase 확인 → `plan_task("Phase N: <제목>", @docs/ROADMAP.md)` → `list_tasks` → `execute_task` → (게이트·리뷰·QA 후) `verify_task`.
- 파이프라인 순서: 개발 → `lint`+`typecheck`(+Playwright 스모크) → `code-reviewer`(정적) → `qa-tester`(동적 실행) → 브랜치 커밋·PR → ROADMAP `✅` 동기화. 상세 아키텍처·역할 분담·트랙 구분은 `docs/autonomous-dev.md` 참고.
- 의사결정이 필요하거나 QA가 반복 실패하면 **`docs/decisions/`** 에 기록하고 루프를 정지한다(→ 카카오 알림). 임의 판단으로 비가역 작업을 진행하지 않는다.

## 명령어 / 검증 규칙

- 개발 서버 `npm run dev`, 빌드 `npm run build`, 린트 `npm run lint`, 타입 검사 `npm run typecheck`(`tsc --noEmit`, 이미 등록됨).
- 코드 변경 후에는 **lint + 타입 검사**를 통과시킨다. 새 페이지/레이아웃 또는 동적 데이터 접근을 추가/수정했다면 **`npm run build`까지** 통과를 확인한다(Cache Components 위반은 `dev`에서 드러나지 않는다 — 위 "Cache Components 규칙" 참고). 런타임 동작 확인이 필요하면 Playwright MCP로 실제 앱을 구동해 검증한다.
- MCP 서버는 `.mcp.json`에 정의된 4종만 사용: `supabase`, `playwright`, `context7`, `shrimp-task-manager`.

## AI 의사결정 기준

- 서버/클라이언트 어디서 Supabase를 쓸지 모호 → 파일 상단에 `"use client"`가 있으면 `lib/supabase/client.ts`, 없으면(서버 컴포넌트/액션/route) `lib/supabase/server.ts`.
- 새 테이블이 특정 구장(클럽)에 속하는 데이터인지 모호 → 소속이 있으면 반드시 `club_id` 컬럼을 추가하고 RLS를 건다. 전역 공용 데이터(예: `profiles`)일 때만 생략한다.
- 새 UI 요소 필요 → 먼저 `components/ui/`에 해당 shadcn 컴포넌트가 있는지 확인 → 없으면 `npx shadcn@latest add` → 그래도 없으면 `components/`에 조합 컴포넌트 작성.
- 대진표/경기 진행 관련 로직을 어디 둘지 모호 → 순수 계산(형태 생성)이면 `lib/tournament/bracket.ts`, 여러 테이블에 걸친 원자적 쓰기면 Postgres RPC.
- 라이브러리 API·버전 사용법이 불확실 → 추측하지 말고 **context7 MCP**로 최신 문서를 조회한다.
- DB 구조 확인 필요 → 추측하지 말고 **supabase MCP `list_tables`** 로 확인한다.
- 요구가 모호하면 먼저 `docs/PRD.md`·`docs/ROADMAP.md`·코드를 확인해 자체 판단하고, 비가역·정책 결정만 사람에게 확인한다.

## 금지 행동 (요약)

- ❌ 서버 Supabase 클라이언트를 모듈 전역에 저장.
- ❌ `updateSession`에서 `createServerClient`와 `getClaims()` 사이 코드 삽입.
- ❌ `proxy.ts`를 `middleware.ts`로 개명 / `proxy`·`config` 구조 임의 변경.
- ❌ `lib/types/database.types.ts` 수기 편집(재생성만).
- ❌ 테넌트 스코프 테이블에 `club_id` 누락 또는 RLS 비활성 상태로 커밋.
- ❌ `SECURITY DEFINER` RPC에서 호출자 제공 `user_id`를 신원 근거로 신뢰.
- ❌ 대진표 형태 계산을 Postgres 함수로, 다중 테이블 원자적 쓰기를 애플리케이션 코드로 구현(역할 반대로 배치).
- ❌ `components/ui/`에 수기 프리미티브 작성 / shadcn 없이 자체 primitive 남발.
- ❌ 커밋에 AI 서명 추가, `git add .`, force push, 무단 `main` 직접 push/병합.
- ❌ 시크릿 하드코딩 / `.env*.local` 커밋.
- ❌ 라이브러리·DB 상태를 추측으로 단정(context7/supabase MCP로 확인).
- ❌ PRD·ROADMAP 갱신 없이 제품 기능만 코드로 추가.
