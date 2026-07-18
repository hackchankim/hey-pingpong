# 데이터베이스 스키마 설계 (Task 002)

> **상태: 설계 문서**. 이 문서는 실제 Supabase 마이그레이션을 적용하지 않은 순수 설계 산출물이다.
> 실제 테이블/RLS/RPC 구현은 ROADMAP Phase 3 (Task 005~008)에서 `supabase/migrations/*.sql`로
> 작성하고 Supabase MCP `apply_migration`으로 적용한다. 여기 포함된 SQL은 참고용 스니펫이며
> 실행 가능한 마이그레이션 파일이 아니다.
>
> 대응하는 TypeScript 타입: `lib/types/domain.ts`(Row/Insert), `lib/types/actions.ts`(Server Action/RPC 입출력).
>
> **8번째 테이블 근거**: `docs/PRD.md`의 데이터 모델은 7개 테이블만 정의하지만, `docs/ROADMAP.md` Task 008이
> "`club_ratings`, `rating_history` 테이블 및 RLS 구현"을 명시적으로 요구하므로 `rating_history`를 추가해
> 총 8개 테이블을 다룬다.

## 목차

1. [전체 ERD 개요](#전체-erd-개요)
2. [club_id 비정규화 대상과 이유](#club_id-비정규화-대상과-이유)
3. [테이블 정의 (8개)](#테이블-정의)
   - [clubs](#1-clubs-구장클럽)
   - [club_members](#2-club_members-클럽-멤버십)
   - [tournaments](#3-tournaments-대회)
   - [tournament_participants](#4-tournament_participants-대회-참가자)
   - [matches](#5-matches-경기)
   - [match_games](#6-match_games-경기별-세트-점수)
   - [club_ratings](#7-club_ratings-클럽별-레이팅)
   - [rating_history](#8-rating_history-레이팅-변동-이력)
4. [RLS 헬퍼 함수](#rls-헬퍼-함수)
5. [SECURITY DEFINER RPC 설계](#security-definer-rpc-설계)
6. [대진표/랭킹 로직 배치 원칙](#대진표랭킹-로직-배치-원칙)

---

## 전체 ERD 개요

```
profiles (기존, Supabase Auth 연동)
  └─< clubs.owner_id
  └─< club_members.user_id
  └─< tournaments.created_by
  └─< tournament_participants.user_id
  └─< matches.player1_id / player2_id / winner_id
  └─< club_ratings.user_id
  └─< rating_history.user_id / opponent_id

clubs
  └─< club_members (club_id)
  └─< tournaments (club_id)
  └─< tournament_participants (club_id, 비정규화)
  └─< matches (club_id, 비정규화)
  └─< club_ratings (club_id)
  └─< rating_history (club_id, 비정규화)

tournaments
  └─< tournament_participants (tournament_id)
  └─< matches (tournament_id)

matches
  └─< match_games (match_id)
  └─< matches.player1_source_match_id / player2_source_match_id (자기참조, 승자 진출)
  └─< rating_history.match_id (nullable)
```

- `profiles`는 기존 스타터킷 테이블(수정하지 않음). 모든 "회원" FK는 `profiles.id`를 참조한다.
- `clubs`가 테넌트 루트다. 아래 "club_id 비정규화 대상과 이유" 참고.

---

## club_id 비정규화 대상과 이유

멀티테넌시 RLS는 **조인 없이 `club_id = <현재 사용자가 속한 클럽>` 등호 비교**만으로 판정되어야
인덱스를 효율적으로 태울 수 있고 정책 작성도 단순해진다. `shrimp-rules.md`는 `tournament_participants`,
`matches`, `match_games`에 `club_id`를 비정규화하는 것을 명시적 규칙으로 못박아 두었으므로(삭제·생략 금지),
아래 4개 테이블 전부에 `club_id`를 **직접 컬럼으로 중복 저장**한다:

| 테이블 | 정규화라면 유도 경로 | 비정규화 이유 |
|---|---|---|
| `tournament_participants` | `tournament_id → tournaments.club_id` | RLS SELECT/INSERT 정책에서 `tournaments` 조인 없이 `club_id` 인덱스로 즉시 필터링 |
| `matches` | `tournament_id → tournaments.club_id` | 대진표/점수 조회는 트래픽이 가장 높은 경로 — 조인 비용 제거가 특히 중요 |
| `match_games` | `match_id → matches.club_id` | `shrimp-rules.md` 규칙에 따라 비정규화(초기 설계에서는 1-hop 종속을 이유로 생략을 검토했으나, 규칙이 명시적으로 지정한 3개 테이블 중 하나이므로 그대로 반영) |
| `rating_history` | `match_id → matches.club_id`(non-null인 경우) | 랭킹 변동 이력 조회가 클럽 스코프로 빈번히 발생 + `match_id`가 nullable(수동 조정)이라 유도 자체가 불가능한 케이스가 있음 |

이 4개 테이블에 행을 insert할 때는 항상 부모(`tournaments.club_id` 또는 `matches.club_id`)에서
값을 복사해 넣어야 하며, 클라이언트가 `club_id`를 임의로 지정해 다른 클럽 데이터를 오염시키지
못하도록 이 로직은 `SECURITY DEFINER`/`SECURITY INVOKER` RPC 내부에 캡슐화한다.

---

## 테이블 정의

### 1. clubs (구장/클럽)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` | |
| name | text | not null | 클럽 이름 |
| slug | text | not null, unique | URL 경로용(`/c/[clubSlug]`) |
| description | text | null 허용 | |
| owner_id | uuid | not null, FK → `profiles.id` | 생성자, 최초 owner |
| invite_code | text | not null, unique | 가입용 초대코드 |
| invite_code_enabled | boolean | not null, default `true` | 초대코드 활성/비활성 토글 |
| plan | text | not null, default `'free'` | 향후 요금제 확장 대비(MVP는 free 고정) |
| initial_rating | integer | not null, default `1500` | 이 클럽 신규 회원의 ELO 초기값 |
| logo_url | text | null 허용 | |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | |

**FK 관계**: `owner_id → profiles.id` (`ON DELETE RESTRICT` — 소유자 삭제 시 클럽 소유권 이전을 먼저 요구).

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(id)` — 멤버만 조회 가능. (초대코드 미리보기용 공개 조회가 필요하면 별도 `invite_code`만 노출하는 최소 컬럼 뷰/RPC로 분리, 이 테이블 직접 공개 SELECT는 열지 않음) |
| INSERT | 직접 INSERT 정책: `owner_id = auth.uid()` 체크만으로 충분(소유권 위임 문제 없음 — `tournaments` INSERT와 동일 패턴). RPC 불필요. 초대코드 유일성 재시도 등은 Server Action에서 처리 |
| UPDATE | `is_club_admin(id)` — 클럽명/설명/로고/초대코드 토글 등 |
| DELETE | `owner_id = auth.uid()`인 owner만, 또는 RPC로만 허용 (하드 삭제는 MVP 범위 밖으로 보류 가능) |

**인덱스**: `slug`(unique, 자동), `invite_code`(unique, 자동), `owner_id`(FK 조회용).

```sql
-- 참고용 스니펫 (실행하지 않음)
create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  owner_id uuid not null references profiles(id),
  invite_code text not null unique,
  invite_code_enabled boolean not null default true,
  plan text not null default 'free',
  initial_rating integer not null default 1500,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_clubs_owner_id on clubs(owner_id);
```

---

### 2. club_members (클럽 멤버십)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| club_id | uuid | not null, FK → `clubs.id` | |
| user_id | uuid | not null, FK → `profiles.id` | |
| role | `club_role` enum (`owner`/`admin`/`member`) | not null, default `'member'` | |
| status | `member_status` enum (`active`/`banned`) | not null, default `'active'` | |
| joined_at | timestamptz | not null, default `now()` | |

**제약**: `unique (club_id, user_id)` — 한 사용자는 클럽당 멤버십 1건.

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` |
| INSERT | 직접 INSERT 정책 없음 — `join_club_with_code` RPC 전용 (아래 RPC 섹션 참고) |
| UPDATE | `is_club_admin(club_id)` — 단, `role`을 `owner`로 바꾸거나 마지막 owner를 강등하는 것은 RPC(`transfer_club_ownership` 등, MVP 이후)에서만 허용하도록 `CHECK`/트리거로 제한 |
| DELETE | `is_club_admin(club_id)`(멤버 내보내기) 또는 `user_id = auth.uid()`(자진 탈퇴) |

**인덱스**: `club_id`(단독, 멤버 목록 조회), `unique(club_id, user_id)`(복합, 자동 인덱스 겸용), `user_id`(내 클럽 목록 조회 — "내 클럽 페이지" F021).

```sql
-- 참고용 스니펫
create type club_role as enum ('owner', 'admin', 'member');
create type member_status as enum ('active', 'banned');

create table club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role club_role not null default 'member',
  status member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index idx_club_members_club_id on club_members(club_id);
create index idx_club_members_user_id on club_members(user_id);
```

---

### 3. tournaments (대회)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| club_id | uuid | not null, FK → `clubs.id` | |
| name | text | not null | |
| format | `tournament_format` enum (`round_robin`/`single_elimination`/`double_elimination`) | not null | |
| status | `tournament_status` enum (`draft`/`registration_open`/`in_progress`/`completed`/`cancelled`) | not null, default `'draft'` | |
| max_participants | integer | null 허용 | 무제한이면 null |
| registration_deadline | timestamptz | null 허용 | |
| starts_at | timestamptz | null 허용 | |
| created_by | uuid | not null, FK → `profiles.id` | |
| ruleset | jsonb | null 허용 | 세트 수, 듀스 여부 등 자유 형식 규칙 |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | |

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` |
| INSERT | `is_club_admin(club_id)` (일반 INSERT 정책으로 충분 — 소유권 위임 문제 없음, RPC 불필요) |
| UPDATE | `is_club_admin(club_id)` — 단, `status` 전환 중 대진표 확정(`registration_open → in_progress`)은 `create_tournament_matches` RPC를 통해서만 일어나도록 애플리케이션에서 강제(직접 UPDATE로 status만 바꾸는 것도 기술적으로 막지는 않되, 매치 생성과 묶이는 전환은 RPC 경유를 권장) |
| DELETE | `is_club_admin(club_id)`, `status = 'draft'`인 경우만(진행 중인 대회 삭제 방지 — CHECK 또는 정책 조건) |

**인덱스**: `club_id`(단독), `(club_id, status)`(복합 — 클럽 홈/대회 목록에서 "진행 중인 대회" 필터링 F022, F004).

```sql
-- 참고용 스니펫
create type tournament_format as enum ('round_robin', 'single_elimination', 'double_elimination');
create type tournament_status as enum ('draft', 'registration_open', 'in_progress', 'completed', 'cancelled');

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  format tournament_format not null,
  status tournament_status not null default 'draft',
  max_participants integer,
  registration_deadline timestamptz,
  starts_at timestamptz,
  created_by uuid not null references profiles(id),
  ruleset jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tournaments_club_id on tournaments(club_id);
create index idx_tournaments_club_id_status on tournaments(club_id, status);
```

---

### 4. tournament_participants (대회 참가자)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| tournament_id | uuid | not null, FK → `tournaments.id` | |
| club_id | uuid | not null, FK → `clubs.id` | **비정규화** (이유는 상단 섹션 참고) |
| user_id | uuid | not null, FK → `profiles.id` | |
| seed | integer | null 허용 | 대진표 생성 시 시드 배정 |
| rating_at_registration | integer | null 허용 | 등록 시점 레이팅 스냅샷(시딩 근거) |
| status | `participant_status` enum (`pending`/`registered`/`checked_in`/`withdrawn`/`disqualified`) | not null, default `'pending'` | `pending`=신청(승인 대기), `registered`=관리자 승인 완료 — PRD F005 "참가 신청/승인 처리"에 대응 |
| final_rank | integer | null 허용 | 대회 종료 후 최종 순위 |
| created_at | timestamptz | not null, default `now()` | |

**제약**: `unique (tournament_id, user_id)`.

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` |
| INSERT | 본인 신청: `user_id = auth.uid() AND is_club_member(club_id)`, `status`는 항상 `pending`으로 시작(체크 제약으로 `pending` 외 값 삽입 차단) — 자기 자신의 참가 신청은 소유권 문제가 없어 직접 정책 허용. `club_id`/`rating_at_registration` 값의 정확성은 트리거 또는 서버 액션에서 `tournaments`/`club_ratings`로부터 채워 클라이언트 조작을 방지 |
| UPDATE | 본인: `user_id = auth.uid()`이고 `status`를 `withdrawn`으로만 전환 가능(체크 제약). 관리자: `is_club_admin(club_id)`로 `pending → registered`(승인)/`disqualified`(실격)/시드 조정 |
| DELETE | `is_club_admin(club_id)` 또는 본인 취소(`pending`/`registered` 상태 한정) |

**인덱스**: `club_id`(단독), `tournament_id`(단독, 참가자 목록 조회), `unique(tournament_id, user_id)`(복합, 자동).

```sql
-- 참고용 스니펫
create type participant_status as enum ('pending', 'registered', 'checked_in', 'withdrawn', 'disqualified');

create table tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  seed integer,
  rating_at_registration integer,
  status participant_status not null default 'pending',
  final_rank integer,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index idx_participants_club_id on tournament_participants(club_id);
create index idx_participants_tournament_id on tournament_participants(tournament_id);
```

---

### 5. matches (경기)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| tournament_id | uuid | not null, FK → `tournaments.id` | |
| club_id | uuid | not null, FK → `clubs.id` | **비정규화** |
| bracket | `match_bracket` enum (`main`/`winners`/`losers`) | not null, default `'main'` | 더블 엘리미네이션 대비, MVP(싱글 엘리미네이션·풀리그)는 `main`만 사용 |
| round | integer | not null | 라운드 번호(풀리그는 회전 라운드, 엘리미네이션은 트리 depth) |
| match_number | integer | not null | 같은 라운드 내 순번 |
| player1_id | uuid | null 허용, FK → `profiles.id` | 부전승/미확정 시 null 가능 |
| player2_id | uuid | null 허용, FK → `profiles.id` | |
| player1_source_match_id | uuid | null 허용, FK → `matches.id`(자기참조) | 엘리미네이션에서 이 경기 승자가 진출해 올 이전 라운드 경기 |
| player2_source_match_id | uuid | null 허용, FK → `matches.id`(자기참조) | |
| is_bye | boolean | not null, default `false` | 부전승 슬롯 |
| status | `match_status` enum (`pending`/`ready`/`in_progress`/`completed`/`walkover`) | not null, default `'pending'` | |
| winner_id | uuid | null 허용, FK → `profiles.id` | |
| player1_games_won | integer | not null, default `0` | `match_games` 집계 캐시(비정규화) |
| player2_games_won | integer | not null, default `0` | |
| scheduled_at | timestamptz | null 허용 | |
| court_label | text | null 허용 | |
| created_at | timestamptz | not null, default `now()` | |
| updated_at | timestamptz | not null, default `now()` | |

**제약**: `unique (tournament_id, bracket, round, match_number)`.

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` |
| INSERT | 직접 INSERT 정책 없음 — `create_tournament_matches` RPC 전용 (대진표 확정 저장은 항상 벌크·원자적) |
| UPDATE | 직접 UPDATE 정책 없음(점수/승자/캐시 컬럼 동시 일관성 필요) — `record_match_result` RPC 전용. 단, `scheduled_at`/`court_label`처럼 순수 메타데이터 수정은 `is_club_admin(club_id)`가 호출 가능한 별도 RPC(`update_match_schedule` 등)로 제공한다 — Postgres RLS는 행 단위이며 컬럼별 제어가 없으므로 "컬럼 단위 정책"이 아니라 전용 RPC로 화이트리스트를 강제한다 |
| DELETE | 직접 DELETE 정책 없음 — `create_tournament_matches` RPC 내부에서만(재생성 시 기존 draft 삭제) |

**인덱스**: `club_id`(단독), `tournament_id`(단독), `(tournament_id, round)`(복합 — 라운드별 조회), `player1_source_match_id`/`player2_source_match_id`(진출 갱신 시 역참조 조회).

```sql
-- 참고용 스니펫
create type match_bracket as enum ('main', 'winners', 'losers');
create type match_status as enum ('pending', 'ready', 'in_progress', 'completed', 'walkover');

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  bracket match_bracket not null default 'main',
  round integer not null,
  match_number integer not null,
  player1_id uuid references profiles(id),
  player2_id uuid references profiles(id),
  player1_source_match_id uuid references matches(id),
  player2_source_match_id uuid references matches(id),
  is_bye boolean not null default false,
  status match_status not null default 'pending',
  winner_id uuid references profiles(id),
  player1_games_won integer not null default 0,
  player2_games_won integer not null default 0,
  scheduled_at timestamptz,
  court_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, bracket, round, match_number)
);
create index idx_matches_club_id on matches(club_id);
create index idx_matches_tournament_id on matches(tournament_id);
create index idx_matches_tournament_round on matches(tournament_id, round);
```

---

### 6. match_games (경기별 세트 점수)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| match_id | uuid | not null, FK → `matches.id` | |
| club_id | uuid | not null, FK → `clubs.id` | **비정규화**(이유는 상단 "club_id 비정규화 대상과 이유" 참고 — shrimp-rules.md 명시 규칙) |
| game_number | integer | not null | 세트 번호(1, 2, 3 …) |
| player1_score | integer | not null | |
| player2_score | integer | not null | |
| created_at | timestamptz | not null, default `now()` | |

**제약**: `unique (match_id, game_number)`.

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` |
| INSERT / UPDATE / DELETE | 직접 정책 없음 — `record_match_result` RPC 전용(세트 점수는 항상 승패 판정·캐시 갱신과 한 트랜잭션이며, `club_id`는 RPC 내부에서 `matches.club_id`를 복사해 채움) |

**인덱스**: `match_id`(단독, 자동으로 조회 대부분 커버), `club_id`(단독), `unique(match_id, game_number)`(복합, 자동).

```sql
-- 참고용 스니펫
create table match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  game_number integer not null,
  player1_score integer not null,
  player2_score integer not null,
  created_at timestamptz not null default now(),
  unique (match_id, game_number)
);
create index idx_match_games_match_id on match_games(match_id);
create index idx_match_games_club_id on match_games(club_id);
```

---

### 7. club_ratings (클럽별 레이팅)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| club_id | uuid | not null, FK → `clubs.id` | |
| user_id | uuid | not null, FK → `profiles.id` | |
| rating | integer | not null, default `1500` | 실제 기본값은 가입 시점 `clubs.initial_rating`을 RPC/트리거에서 복사 |
| matches_played | integer | not null, default `0` | |
| wins | integer | not null, default `0` | |
| losses | integer | not null, default `0` | |
| updated_at | timestamptz | not null, default `now()` | |

**제약**: `unique (club_id, user_id)`.

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `is_club_member(club_id)` — 랭킹 페이지는 클럽 멤버 전체 공개(F010) |
| INSERT | 직접 INSERT 정책 없음 — `join_club_with_code`(가입 시 초기 레이팅 행 생성) 및 `record_match_result`(최초 경기 시 upsert) RPC 전용 |
| UPDATE | 직접 UPDATE 정책 없음 — `record_match_result` RPC 전용(레이팅 변경은 항상 `rating_history`와 함께 원자적으로) |
| DELETE | 없음(레이팅 이력 보존, 클럽 탈퇴 시에도 과거 기록 유지) |

**인덱스**: `club_id`(단독), `(club_id, rating desc)`(복합 — 순위표 정렬 조회 F010).

```sql
-- 참고용 스니펫
create table club_ratings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating integer not null default 1500,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index idx_club_ratings_club_id on club_ratings(club_id);
create index idx_club_ratings_club_id_rating on club_ratings(club_id, rating desc);
```

---

### 8. rating_history (레이팅 변동 이력)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| club_id | uuid | not null, FK → `clubs.id` | **비정규화**(클럽 스코프 이력 조회 최적화) |
| user_id | uuid | not null, FK → `profiles.id` | |
| match_id | uuid | null 허용, FK → `matches.id` | 수동 조정(`manual_adjustment`)인 경우 null |
| rating_before | integer | not null | |
| rating_after | integer | not null | |
| delta | integer | not null | `rating_after - rating_before`(비정규화 캐시, 조회 편의) |
| opponent_id | uuid | null 허용, FK → `profiles.id` | |
| opponent_rating_before | integer | null 허용 | |
| reason | `rating_change_reason` enum (`match_result`/`manual_adjustment`) | not null, default `'match_result'` | |
| created_at | timestamptz | not null, default `now()` | |

**RLS 정책 방향**

| 작업 | 정책 |
|---|---|
| SELECT | `user_id = auth.uid() OR is_club_admin(club_id)` — PRD F010은 "내 레이팅 변동 추이"로 개인 스코프이고, `opponent_rating_before` 등 상대방 정보까지 포함되어 있어 처음부터 본인/관리자로 좁힌다(공개 범위는 나중에 완화하기 쉽지만, 이미 노출된 이력은 되돌릴 수 없음) |
| INSERT / UPDATE / DELETE | 직접 정책 없음 — `record_match_result` RPC 전용(경기 결과와 항상 함께 생성, 수정·삭제 불가 — append-only 이력) |

**인덱스**: `club_id`(단독), `(user_id, created_at desc)`(복합 — 개인 레이팅 추이 조회), `match_id`(경기별 이력 역조회).

```sql
-- 참고용 스니펫
create type rating_change_reason as enum ('match_result', 'manual_adjustment');

create table rating_history (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  match_id uuid references matches(id),
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  opponent_id uuid references profiles(id),
  opponent_rating_before integer,
  reason rating_change_reason not null default 'match_result',
  created_at timestamptz not null default now()
);
create index idx_rating_history_club_id on rating_history(club_id);
create index idx_rating_history_user_created on rating_history(user_id, created_at desc);
create index idx_rating_history_match_id on rating_history(match_id);
```

---

## RLS 헬퍼 함수

모든 정책은 반복 서브쿼리 대신 아래 두 `SECURITY DEFINER` 함수를 재사용한다(shrimp-rules.md 원칙).

```sql
-- 참고용 스니펫
create or replace function is_club_member(target_club_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from club_members
    where club_id = target_club_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function is_club_admin(target_club_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from club_members
    where club_id = target_club_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;
```

새 정책을 추가할 때도 이 두 함수 중 하나(또는 `user_id = auth.uid()` 본인 확인)로 표현 가능한지
먼저 검토하고, 표현 불가능한 복잡한 소유권 로직은 RPC로 옮긴다.

---

## SECURITY DEFINER RPC 설계

세 RPC 모두 **호출자가 넘긴 식별 정보를 신뢰하지 않고 내부에서 `auth.uid()`로 신원을 재확인**한다.
대응 TypeScript 입출력 타입은 `lib/types/actions.ts`에 정의되어 있다.

### `join_club_with_code(invite_code text)`

- **책임**: 초대코드로 클럽에 합류. `club_members` 행 생성(직접 INSERT 정책이 없으므로 유일한 경로) +
  `club_ratings` 초기 행 생성(해당 클럽 `initial_rating` 값으로).
- **트랜잭션 범위**: 코드 유효성 검사(`invite_code_enabled = true`) → 기존 멤버십/차단 여부 확인 →
  `club_members` insert → `club_ratings` insert(upsert, 이미 있으면 skip) — 전체를 단일 함수 트랜잭션으로.
- **`auth.uid()` 재확인**: 함수 시그니처에 `user_id` 파라미터를 두지 않는다. 누가 가입하는지는
  전적으로 `auth.uid()`로 결정하며, 이는 `JoinClubWithCodeInput`(`lib/types/actions.ts`)에도 반영됨
  (입력에 `invite_code`만 존재).
- **실패 케이스**: 존재하지 않는 코드, 비활성화된 코드, 이미 가입됨, 차단된(`banned`) 사용자 재가입 시도.

### `create_tournament_matches(tournament_id uuid, matches jsonb)`

- **책임**: `lib/tournament/bracket.ts`(순수 TS)가 계산한 대진 형태(`BracketMatchInput[]`)를
  받아 실제 `matches` 행으로 원자적 저장.
- **트랜잭션 범위**: (1) 해당 `tournament_id`의 기존 `matches`가 전부 `draft` 단계 산출물이면 삭제 →
  (2) 벌크 insert(자기참조 `player1_source_match_id`/`player2_source_match_id`는 입력의
  `match_ref` 임시 키를 실제 생성된 `id`로 2단계 매핑 후 채움) → (3) `tournaments.status`를
  `registration_open`(또는 `draft`)에서 `in_progress`로 전환. 세 단계를 한 트랜잭션에서 처리.
- **권한 확인**: 내부에서 `is_club_admin(tournaments.club_id)`를 `auth.uid()` 기준으로 확인 후 진행.
- **호출자 입력**: `CreateTournamentMatchesInput`(`lib/types/actions.ts`) — 대진표의 "형태"만 순수
  함수로 계산되어 넘어오고, DB 쓰기·상태 전환은 전적으로 이 RPC 책임이라는 역할 분리가 핵심.

### `record_match_result(match_id uuid, games jsonb, walkover_winner_id uuid default null)`

- **책임**: 경기 결과 확정과 그로 인해 연쇄적으로 갱신되어야 하는 모든 상태를 하나의 트랜잭션으로 처리.
  이 RPC 하나에 다중 테이블 쓰기를 모으는 이유는 shrimp-rules.md의 "여러 테이블이 한 번에 일관되어야
  하는 로직" 원칙 때문이다.
- **트랜잭션 범위**:
  1. `match_games` 벌크 upsert (또는 walkover면 스킵)
  2. 세트 스코어로 승패 계산 → `matches.winner_id`, `status`, `player1_games_won`/`player2_games_won` 갱신
  3. 엘리미네이션이면 승자를 `player1_source_match_id`/`player2_source_match_id`로 이 경기를
     참조하는 다음 라운드 `matches` 행에 배정(`advanced_match`)
  4. `lib/rating/elo.ts`의 계산 결과를 받아(또는 RPC 내부에서 동일 공식 적용) `club_ratings` upsert +
     `rating_history` insert(양쪽 선수 각 1행)
  5. 대회의 모든 경기가 `completed`/`walkover`면 `tournaments.status`를 `completed`로 전환하고
     `tournament_participants.final_rank` 계산
- **`auth.uid()` 재확인**: 내부에서 `is_club_member(matches.club_id)`(점수 입력 가능 여부) 또는
  `is_club_admin`(정정 입력 등 정책에 따라) 확인. "누가 결과를 기록했는가"를 클라이언트가 주장하는
  값으로 신뢰하지 않는다.
- **응답**: `RecordMatchResultResult`(`lib/types/actions.ts`) — 갱신된 `match`, 진출 배정된
  `advanced_match`(없으면 null), 양쪽의 `rating_changes`, `tournament_completed` 여부를 함께 반환해
  클라이언트가 추가 조회 없이 UI를 갱신할 수 있게 한다.

---

## 대진표/랭킹 로직 배치 원칙

- **대진표 "형태" 계산**(풀리그 서클법 라운드 배정, 싱글/더블 엘리미네이션 시딩과 부전승 배치)은
  `lib/tournament/bracket.ts`의 **순수 TypeScript 함수**로만 구현한다. 입력은 참가자 목록(+시드),
  출력은 `BracketMatchInput[]`(`lib/types/actions.ts`) 형태 — DB 접근이 전혀 없어 단위 테스트가 쉽고,
  Postgres 함수로 이 로직을 구현하지 않는다.
- **대진표 "저장"**(형태를 실제 행으로 확정)은 `create_tournament_matches` RPC가 원자적으로 담당한다.
  즉 "계산"과 "저장"의 책임이 언어(TS vs SQL) 경계로 명확히 나뉜다.
- **경기 진행/점수/레이팅처럼 여러 테이블이 얽히는 쓰기**는 예외 없이 `record_match_result` RPC
  하나에 모은다 — 부분 실패로 `matches`는 갱신됐는데 `club_ratings`는 갱신되지 않는 상태를 방지하기
  위함. 이 로직을 Server Action에서 여러 개별 쿼리로 나눠 구현하지 않는다.
- ELO 계산 공식·K-factor 상수는 `lib/rating/elo.ts`에 정의하되, 클럽별 초기 레이팅은 하드코딩하지
  않고 `clubs.initial_rating`을 참조한다(가입 시 `join_club_with_code`, 경기 시 `record_match_result`
  양쪽에서 참조 가능해야 함).
