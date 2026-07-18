-- Task 007: 대진표 생성 및 경기 진행 엔진 백엔드
-- docs/schema-design.md "5. matches", "6. match_games" 섹션 참고.
-- 대진표 형태 계산(circle method / single elimination seeding)은 DB가 아니라
-- lib/tournament/bracket.ts의 순수 함수로만 구현한다(shrimp-rules.md 원칙) — 이 마이그레이션은
-- 순수 저장소(테이블/RLS) + 두 원자적 RPC(create_tournament_matches, record_match_result)만 다룬다.
-- club_ratings/rating_history/ELO 계산은 Task008 범위이므로 이 마이그레이션에 포함하지 않는다.

-- enum 정의 -------------------------------------------------------------
create type public.match_bracket as enum (
  'main',
  'winners',
  'losers'
);

create type public.match_status as enum (
  'pending',
  'ready',
  'in_progress',
  'completed',
  'walkover'
);

-- matches -------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  -- club_id는 tournament_id로부터 유도 가능하지만 RLS를 조인 없이 등호 비교로 유지하기 위해
  -- 비정규화한다(shrimp-rules.md 멀티테넌시 규칙). create_tournament_matches RPC가 항상
  -- tournaments.club_id를 조회해 서버 쪽에서 채우며, 클라이언트 입력을 신뢰하지 않는다.
  club_id uuid not null references public.clubs (id) on delete cascade,
  bracket public.match_bracket not null default 'main',
  round integer not null,
  match_number integer not null,
  player1_id uuid references public.profiles (id) on delete set null,
  player2_id uuid references public.profiles (id) on delete set null,
  -- 엘리미네이션에서 "이전 라운드 승자가 이 자리로 진출한다"를 나타내는 자기참조 FK.
  -- deferrable initially deferred로 선언해 같은 트랜잭션(create_tournament_matches RPC) 안에서
  -- 서로를 참조하는 여러 행을 한 번에 벌크 insert해도 제약이 커밋 시점까지 미뤄져 문제없다 —
  -- 이게 대진표 생성 RPC를 단일 INSERT로 구현할 수 있게 하는 핵심 전제.
  player1_source_match_id uuid references public.matches (id) deferrable initially deferred,
  player2_source_match_id uuid references public.matches (id) deferrable initially deferred,
  is_bye boolean not null default false,
  status public.match_status not null default 'pending',
  winner_id uuid references public.profiles (id) on delete set null,
  -- match_games 집계 캐시 (비정규화, record_match_result RPC가 갱신)
  player1_games_won integer not null default 0,
  player2_games_won integer not null default 0,
  scheduled_at timestamptz,
  court_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, bracket, round, match_number)
);

create index idx_matches_club_id on public.matches (club_id);
create index idx_matches_tournament_id on public.matches (tournament_id);
create index idx_matches_tournament_id_round on public.matches (tournament_id, round);
create index idx_matches_player1_source_match_id on public.matches (player1_source_match_id);
create index idx_matches_player2_source_match_id on public.matches (player2_source_match_id);

-- match_games -------------------------------------------------------------
create table public.match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  -- matches.club_id 비정규화 — shrimp-rules.md 규칙에 따라 조인 없이 RLS 등호 비교를 위함.
  club_id uuid not null references public.clubs (id) on delete cascade,
  game_number integer not null,
  player1_score integer not null,
  player2_score integer not null,
  created_at timestamptz not null default now(),
  unique (match_id, game_number)
);

create index idx_match_games_match_id on public.match_games (match_id);
create index idx_match_games_club_id on public.match_games (club_id);

-- RLS: matches -------------------------------------------------------------
-- SELECT 정책만 만든다. INSERT/UPDATE/DELETE 정책은 의도적으로 만들지 않는다 — RLS는
-- 정책이 없으면 기본적으로 모든 쓰기를 거부하므로, 이 테이블의 쓰기는 아래
-- create_tournament_matches / record_match_result SECURITY DEFINER RPC를 통해서만 가능하다.
alter table public.matches enable row level security;

create policy "matches_select_member"
  on public.matches for select
  using (public.is_club_member(club_id));

-- RLS: match_games -------------------------------------------------------------
alter table public.match_games enable row level security;

create policy "match_games_select_member"
  on public.match_games for select
  using (public.is_club_member(club_id));

-- ---------------------------------------------------------------------------
-- create_tournament_matches: 대진표 확정 저장 (F006)
-- lib/tournament/bracket.ts가 계산한 BracketMatchInput[]을 받아, 기존 draft 경기 삭제 ->
-- 벌크 insert -> tournaments.status 전환을 하나의 트랜잭션으로 처리한다.
-- p_matches의 각 요소는 BracketMatchInput 형태의 jsonb: { bracket, round, match_number,
-- player1_id?, player2_id?, player1_source_match_ref?, player2_source_match_ref?, match_ref,
-- is_bye? }. match_ref가 이 경기 자신의 실제 matches.id로 쓰이고, *_source_match_ref는 같은
-- 배열 안 다른 요소의 match_ref를 가리키는 임시 참조 키다(player1_source_match_id 등
-- deferred FK 덕분에 한 INSERT 문으로 서로 참조하는 행을 함께 넣을 수 있다).
-- ---------------------------------------------------------------------------
create or replace function public.create_tournament_matches(
  p_tournament_id uuid,
  p_matches jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_club_id uuid;
begin
  select t.club_id into v_club_id
  from public.tournaments t
  where t.id = p_tournament_id;

  if not found then
    raise exception 'tournament not found' using errcode = 'P0002';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 기존 draft 경기 전체 삭제. match_games는 on delete cascade로 자동 정리된다.
  delete from public.matches where tournament_id = p_tournament_id;

  insert into public.matches (
    id,
    tournament_id,
    club_id,
    bracket,
    round,
    match_number,
    player1_id,
    player2_id,
    player1_source_match_id,
    player2_source_match_id,
    is_bye
  )
  select
    (elem ->> 'match_ref')::uuid,
    p_tournament_id,
    v_club_id,
    coalesce(elem ->> 'bracket', 'main')::public.match_bracket,
    (elem ->> 'round')::int,
    (elem ->> 'match_number')::int,
    (elem ->> 'player1_id')::uuid,
    (elem ->> 'player2_id')::uuid,
    (elem ->> 'player1_source_match_ref')::uuid,
    (elem ->> 'player2_source_match_ref')::uuid,
    coalesce((elem ->> 'is_bye')::boolean, false)
  from jsonb_array_elements(p_matches) as elem;

  update public.tournaments
    set status = 'in_progress', updated_at = now()
    where id = p_tournament_id;
end;
$$;

alter function public.create_tournament_matches(uuid, jsonb) set search_path = '';
grant execute on function public.create_tournament_matches(uuid, jsonb) to authenticated;
revoke execute on function public.create_tournament_matches(uuid, jsonb) from anon, public;

-- ---------------------------------------------------------------------------
-- record_match_result: 경기 결과 기록 + 다음 라운드 진출 배정 + 대회 완료 처리 (F007~F009)
-- 여러 테이블(matches, match_games, tournaments)이 한 번에 일관되어야 하는 로직이므로
-- 애플리케이션 코드로 분산 구현하지 않고 이 RPC 하나로 모은다(shrimp-rules.md 원칙).
-- club_ratings/rating_history 갱신은 아직 테이블이 없어(Task008 범위) rating_changes는
-- 항상 빈 배열로 반환한다.
-- ---------------------------------------------------------------------------
create or replace function public.record_match_result(
  p_match_id uuid,
  p_games jsonb,
  p_walkover_winner_id uuid default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_club_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_tournament_id uuid;
  v_match public.matches%rowtype;
  v_advanced_match public.matches%rowtype;
  v_has_advanced boolean := false;
  v_tournament_completed boolean := false;
  v_p1_wins int := 0;
  v_p2_wins int := 0;
  v_game record;
  v_winner_id uuid;
begin
  select m.club_id, m.player1_id, m.player2_id, m.tournament_id
    into v_club_id, v_player1_id, v_player2_id, v_tournament_id
  from public.matches m
  where m.id = p_match_id;

  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_walkover_winner_id is not null then
    update public.matches
      set status = 'walkover',
          winner_id = p_walkover_winner_id,
          updated_at = now()
      where id = p_match_id
      returning * into v_match;
  else
    -- 세트별 점수를 match_games에 insert하면서 동시에 승 수를 집계한다.
    -- 라켓 스포츠는 세트 무승부가 없다는 전제로, 세트 점수가 같으면 즉시 예외를 던진다.
    for v_game in
      select
        (g ->> 'game_number')::int as game_number,
        (g ->> 'player1_score')::int as player1_score,
        (g ->> 'player2_score')::int as player2_score
      from jsonb_array_elements(p_games) as g
    loop
      insert into public.match_games (match_id, club_id, game_number, player1_score, player2_score)
      values (p_match_id, v_club_id, v_game.game_number, v_game.player1_score, v_game.player2_score);

      if v_game.player1_score = v_game.player2_score then
        raise exception 'game score cannot be tied' using errcode = '22023';
      elsif v_game.player1_score > v_game.player2_score then
        v_p1_wins := v_p1_wins + 1;
      else
        v_p2_wins := v_p2_wins + 1;
      end if;
    end loop;

    if v_p1_wins = v_p2_wins then
      raise exception 'match cannot end in a tie' using errcode = '22023';
    end if;

    v_winner_id := case when v_p1_wins > v_p2_wins then v_player1_id else v_player2_id end;

    update public.matches
      set status = 'completed',
          winner_id = v_winner_id,
          player1_games_won = v_p1_wins,
          player2_games_won = v_p2_wins,
          updated_at = now()
      where id = p_match_id
      returning * into v_match;
  end if;

  -- 다음 라운드 진출 배정: 이 경기를 player1_source_match_id 또는 player2_source_match_id로
  -- 참조하는 다음 경기가 있으면(정확히 하나만 매칭됨) 승자를 채워 넣는다.
  update public.matches
    set player1_id = v_match.winner_id, updated_at = now()
    where player1_source_match_id = p_match_id
    returning * into v_advanced_match;

  if found then
    v_has_advanced := true;
  else
    update public.matches
      set player2_id = v_match.winner_id, updated_at = now()
      where player2_source_match_id = p_match_id
      returning * into v_advanced_match;

    if found then
      v_has_advanced := true;
    end if;
  end if;

  -- 갱신된 다음 경기의 양쪽 선수가 모두 채워졌으면 진행 가능 상태로 전환한다.
  if v_has_advanced
    and v_advanced_match.player1_id is not null
    and v_advanced_match.player2_id is not null
  then
    update public.matches
      set status = 'ready', updated_at = now()
      where id = v_advanced_match.id
      returning * into v_advanced_match;
  end if;

  -- 대회 완료 판정: 이 대회의 모든 경기가 completed/walkover면 대회 자체를 완료 처리한다.
  select not exists (
    select 1 from public.matches
    where tournament_id = v_tournament_id
      and status not in ('completed', 'walkover')
  ) into v_tournament_completed;

  if v_tournament_completed then
    update public.tournaments
      set status = 'completed', updated_at = now()
      where id = v_tournament_id;
  end if;

  return json_build_object(
    'match', row_to_json(v_match),
    'advanced_match', case when v_has_advanced then row_to_json(v_advanced_match) else null end,
    'rating_changes', '[]'::jsonb,
    'tournament_completed', v_tournament_completed
  );
end;
$$;

alter function public.record_match_result(uuid, jsonb, uuid) set search_path = '';
grant execute on function public.record_match_result(uuid, jsonb, uuid) to authenticated;
revoke execute on function public.record_match_result(uuid, jsonb, uuid) from anon, public;
