# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 명령어

```bash
npm run dev        # 개발 서버 실행 (localhost:3000)
npm run build      # 프로덕션 빌드
npm run lint       # ESLint 검사
npm run typecheck  # 타입 검사 (tsc --noEmit)
```

테스트 프레임워크는 구성되어 있지 않습니다. 런타임 검증은 Playwright MCP로 수행합니다.

## 환경 변수

`.env.local` 파일을 생성하고 아래 값을 입력합니다:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

두 값 모두 Supabase 프로젝트의 API 설정에서 확인할 수 있습니다. 기존 anon 키와 새로운 publishable 키 형식 모두 사용 가능합니다.

## 아키텍처

**스택:** Next.js 16 App Router (Cache Components 활성화) · Supabase (`@supabase/ssr`) · shadcn/ui · Tailwind CSS v3 · TypeScript

### Supabase 클라이언트 패턴

두 가지 클라이언트 팩토리를 상황에 맞게 구분하여 사용해야 합니다:

- `lib/supabase/client.ts` — `createBrowserClient` 기반 브라우저 클라이언트. `"use client"` 컴포넌트에서만 사용합니다.
- `lib/supabase/server.ts` — `createServerClient` + Next.js `cookies()` 기반 서버 클라이언트. 서버 컴포넌트, Route Handler, 서버 액션에서 사용합니다. **Fluid compute 요구사항으로 인해 모듈 레벨 변수에 저장하면 안 됩니다.**

### 세션 관리

루트의 `proxy.ts`가 Next.js 프록시 파일입니다. 이 파일은 `lib/supabase/proxy.ts → updateSession()`을 호출하며, 매 요청마다 `supabase.auth.getClaims()`로 세션을 갱신합니다. 인증되지 않은 요청은 `/`, `/login`, `/auth/*` 경로를 제외하고 `/auth/login`으로 리다이렉트됩니다. **`createServerClient`와 `getClaims()` 호출 사이에 다른 코드를 추가하지 마세요.**

### Cache Components (Next.js 16)

`next.config.ts`에 `cacheComponents: true`가 설정되어 있습니다(구 PPR/dynamicIO). 페이지·레이아웃에서 `cookies()`/`headers()`/Supabase 인증 호출·동적 라우트 `params`처럼 요청마다 달라지는("uncached") 값을 접근할 때는 **반드시 `<Suspense>` 경계 안에서** 접근해야 합니다. 그렇지 않으면 `npm run build`가 "Uncached data was accessed outside of `<Suspense>`" 오류로 실패합니다(`npm run dev`에서는 드러나지 않으므로 배포 전 반드시 `npm run build`로 확인).

- 인증 게이트가 필요한 레이아웃은 `params` 접근과 `getClaims()` 호출을 **하나의 비동기 컴포넌트**로 묶고, 그 컴포넌트 전체를 `<Suspense>`로 감싸는 패턴을 따릅니다(`app/(dashboard)/layout.tsx`, `app/c/[clubSlug]/layout.tsx` 참고). `redirect()`는 이 컴포넌트 내부, 자식 렌더링 이전에 호출되므로 보호된 콘텐츠가 노출되기 전에 리다이렉트가 발생합니다.
- 새 보호 라우트/레이아웃을 추가할 때 이 패턴을 재사용하세요.

### 라우트 구조

```
app/
  page.tsx                    # 공개 랜딩 페이지
  layout.tsx                  # 루트 레이아웃
  auth/
    login/                    # 로그인 페이지 (LoginForm 클라이언트 컴포넌트 사용)
    sign-up/                  # 회원가입
    sign-up-success/          # 가입 완료 안내
    forgot-password/          # 비밀번호 재설정 요청
    update-password/          # 비밀번호 재설정 폼
    confirm/route.ts          # 이메일 OTP 인증 핸들러
    error/                    # 인증 오류 표시
  (dashboard)/                # 인증 게이트 + nav/footer 셸 (구 app/protected 대체)
    dashboard/                # 내 클럽 목록
    clubs/
      new/                    # 클럽 생성 폼 골격
      join/                   # 초대코드 가입 폼 골격
  c/[clubSlug]/                # 클럽 스코프 라우트 (인증 게이트 + 클럽 nav)
    page.tsx                  # 클럽 홈
    members/                  # 멤버 관리
    tournaments/               # 대회 목록/상세/대진표
    ranking/                  # 랭킹
```

### 데이터베이스 타입

`lib/types/database.types.ts`는 Supabase에서 생성된 타입 파일입니다(**수기 편집 금지**, 재생성만). `Profile`, `ProfileInsert`, `ProfileUpdate` 편의 타입을 export합니다. 스키마 변경 후에는 아래 명령어로 재생성합니다:

```bash
npx supabase gen types typescript --project-id <id> > lib/types/database.types.ts
```

현재 정의된 실제 테이블은 `profiles` (`id`, `email`, `full_name`, `username`, `avatar_url`, `bio`, `website`) 하나입니다. 아직 마이그레이션이 적용되지 않은 도메인(클럽/대회/랭킹) 스키마 설계는 `docs/schema-design.md`에, 그에 대응하는 수기 관리 TypeScript 타입은 `lib/types/domain.ts`(Row/Insert)와 `lib/types/actions.ts`(Server Action/RPC 입출력)에 있습니다 — 이 둘은 `database.types.ts`와 별개 파일이며 실제 마이그레이션 적용 후 점진적으로 교체됩니다.

### UI 컴포넌트

shadcn/ui 컴포넌트는 `components/ui/`에 위치합니다. 새 컴포넌트 추가 시 `npx shadcn@latest add <component>`를 사용합니다. `cn()` 유틸리티(`lib/utils.ts`)는 `clsx` + `tailwind-merge`로 Tailwind 클래스를 병합합니다.

도메인 공통 컴포넌트(`club-card.tsx`, `tournament-card.tsx`, `ranking-table.tsx`, `bracket-view.tsx`, `participant-list.tsx`)는 `components/` 루트에 있으며, `lib/types/domain.ts` 타입을 props로만 받고 데이터 소스(`lib/dummy-data.ts` 등)를 직접 import하지 않습니다 — 더미 데이터와 실제 Supabase 데이터 양쪽에서 재사용 가능하게 유지하는 설계 원칙이므로 새 도메인 컴포넌트를 추가할 때도 이 경계를 지킵니다.
