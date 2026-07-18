-- Task 006: 대회(tournaments) / 대회 참가자(tournament_participants) 도메인 백엔드
-- docs/schema-design.md "3. tournaments", "4. tournament_participants" 섹션 참고.
-- matches/match_games/create_tournament_matches RPC 등 대진표 생성 로직은 Task007 범위이므로
-- 이 마이그레이션에는 포함하지 않는다.

-- enum 정의 -------------------------------------------------------------
create type public.tournament_format as enum (
  'round_robin',
  'single_elimination',
  'double_elimination'
);

create type public.tournament_status as enum (
  'draft',
  'registration_open',
  'in_progress',
  'completed',
  'cancelled'
);

create type public.participant_status as enum (
  'pending',
  'registered',
  'checked_in',
  'withdrawn',
  'disqualified'
);

-- tournaments -------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  format public.tournament_format not null,
  status public.tournament_status not null default 'draft',
  max_participants integer,
  registration_deadline timestamptz,
  starts_at timestamptz,
  created_by uuid not null references public.profiles (id),
  ruleset jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tournaments_club_id on public.tournaments (club_id);
create index idx_tournaments_club_id_status on public.tournaments (club_id, status);

-- tournament_participants ---------------------------------------------------
create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  -- club_id는 tournament_id로부터 유도 가능하지만 RLS를 조인 없이 등호 비교로 유지하기 위해
  -- 비정규화한다(shrimp-rules.md 멀티테넌시 규칙). 항상 아래 트리거가 재계산해서 채운다.
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed integer,
  -- 이번 태스크(Task006)에서는 club_ratings 테이블이 아직 없어 항상 null로 남는다.
  -- 레이팅 스냅샷 계산 로직은 Task008 범위.
  rating_at_registration integer,
  status public.participant_status not null default 'pending',
  final_rank integer,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index idx_participants_club_id on public.tournament_participants (club_id);
create index idx_participants_tournament_id on public.tournament_participants (tournament_id);

-- club_id 비정규화 강제 트리거 -----------------------------------------------
-- 클라이언트가 PostgREST로 어떤 club_id를 보내든 무시하고, tournament_id로부터
-- 실제 club_id를 재계산해 강제로 덮어쓴다. 이 트리거는 BEFORE INSERT이므로
-- RLS INSERT 정책(WITH CHECK)이 평가되는 시점에는 이미 올바른 club_id가 들어있어,
-- participants_insert_self 정책의 is_club_member(club_id) 체크가 "진짜" 클럽을 기준으로
-- 동작한다 — 다른 클럽 id를 주입해 멤버십 체크를 우회하는 것을 원천적으로 막는다.
create or replace function public.set_tournament_participant_club_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select t.club_id into new.club_id
  from public.tournaments t
  where t.id = new.tournament_id;

  return new;
end;
$$;

create trigger trg_set_tournament_participant_club_id
  before insert on public.tournament_participants
  for each row
  execute function public.set_tournament_participant_club_id();

-- RLS: tournaments ----------------------------------------------------------
alter table public.tournaments enable row level security;

create policy "tournaments_select_member"
  on public.tournaments for select
  using (public.is_club_member(club_id));

create policy "tournaments_insert_admin"
  on public.tournaments for insert
  with check (public.is_club_admin(club_id));

create policy "tournaments_update_admin"
  on public.tournaments for update
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "tournaments_delete_admin"
  on public.tournaments for delete
  using (public.is_club_admin(club_id) and status = 'draft');

-- RLS: tournament_participants ------------------------------------------------
alter table public.tournament_participants enable row level security;

create policy "participants_select_member"
  on public.tournament_participants for select
  using (public.is_club_member(club_id));

create policy "participants_insert_self"
  on public.tournament_participants for insert
  with check (
    user_id = auth.uid()
    and public.is_club_member(club_id)
    and status = 'pending'
  );

create policy "participants_update_self"
  on public.tournament_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'withdrawn');

create policy "participants_update_admin"
  on public.tournament_participants for update
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "participants_delete_admin_or_self"
  on public.tournament_participants for delete
  using (public.is_club_admin(club_id) or user_id = auth.uid());
