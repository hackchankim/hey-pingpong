-- Task 008: ELO 랭킹 엔진 구현
-- docs/schema-design.md의 club_ratings/rating_history 설계를 실제 테이블로 만들고,
-- 기존 create_club / join_club_with_code / record_match_result RPC를 CREATE OR REPLACE로
-- 확장한다. 세 RPC의 함수 시그니처(이름/파라미터)와 기존 로직(권한 체크, 재시도 루프,
-- 재실행 가드, 다음 라운드 진출 배정, 대회 완료 판정 등)은 100% 그대로 유지하고, ELO
-- 레이팅 갱신 로직만 추가한다 — lib/actions/clubs.ts, lib/actions/matches.ts가 이미 이
-- 시그니처로 RPC를 호출하고 있어 시그니처를 바꾸면 그 코드가 깨진다.
--
-- ELO 계산 공식은 lib/rating/elo.ts에 순수 함수로도 문서화되어 있지만, 실제 갱신은
-- 동시성 하에서 원자적으로 이뤄져야 하므로 이 마이그레이션의 record_match_result RPC
-- 안에서 plpgsql로 재구현한다(lib/rating/elo.ts 파일 상단 주석 참고).

-- enum 정의 -------------------------------------------------------------
create type public.rating_change_reason as enum (
  'match_result',
  'manual_adjustment'
);

-- club_ratings -------------------------------------------------------------
create table public.club_ratings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null default 1500,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index idx_club_ratings_club_id on public.club_ratings (club_id);
create index idx_club_ratings_club_id_rating on public.club_ratings (club_id, rating desc);

-- rating_history -------------------------------------------------------------
create table public.rating_history (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  opponent_id uuid references public.profiles (id) on delete set null,
  opponent_rating_before integer,
  reason public.rating_change_reason not null default 'match_result',
  created_at timestamptz not null default now()
);

create index idx_rating_history_club_id on public.rating_history (club_id);
create index idx_rating_history_user_id on public.rating_history (user_id);

-- RLS: club_ratings -------------------------------------------------------------
-- SELECT 정책만 만든다. INSERT/UPDATE/DELETE 정책은 의도적으로 만들지 않는다 — RLS는
-- 정책이 없으면 기본적으로 모든 쓰기를 거부하므로, 이 테이블의 쓰기는 아래
-- create_club / join_club_with_code / record_match_result SECURITY DEFINER RPC를
-- 통해서만 가능하다(Task007 matches/match_games와 동일한 패턴).
alter table public.club_ratings enable row level security;

create policy "club_ratings_select_member"
  on public.club_ratings for select
  using (public.is_club_member(club_id));

-- RLS: rating_history -------------------------------------------------------------
alter table public.rating_history enable row level security;

create policy "rating_history_select_member"
  on public.rating_history for select
  using (public.is_club_member(club_id));

-- 기존 멤버 백필 -------------------------------------------------------------
-- 이 마이그레이션 이전에 이미 가입되어 있던 club_members 각 행에 대해, 아직 없는
-- club_ratings 행을 클럽별 initial_rating으로 채운다.
insert into public.club_ratings (club_id, user_id, rating)
select cm.club_id, cm.user_id, c.initial_rating
from public.club_members cm
join public.clubs c on c.id = cm.club_id
on conflict (club_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- create_club 확장: 클럽 생성 시 owner의 club_ratings 행을 클럽 initial_rating으로 생성.
-- 기존 로직(초대코드 재시도 루프, slug unique_violation 즉시 전파 등)은 100% 그대로 유지.
-- ---------------------------------------------------------------------------
create or replace function public.create_club(p_name text, p_slug text, p_description text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_invite_code text;
  v_club public.clubs%rowtype;
  v_member public.club_members%rowtype;
  v_attempt int := 0;
  v_constraint text;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- invite_code는 함수 내부에서 랜덤 생성. unique violation(코드 충돌) 시 최대 5회 재시도.
  -- slug unique violation은 재시도로 해결되지 않으므로 즉시 예외를 그대로 전파해
  -- 클라이언트(Server Action)가 "이미 사용 중인 URL" 에러로 구분 처리할 수 있게 한다.
  loop
    v_attempt := v_attempt + 1;
    v_invite_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

    begin
      insert into public.clubs (name, slug, description, owner_id, invite_code)
      values (p_name, p_slug, p_description, v_owner_id, v_invite_code)
      returning * into v_club;

      exit; -- 성공 시 재시도 루프 탈출
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      if v_constraint = 'clubs_slug_key' then
        raise;
      end if;

      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  -- 생성자를 owner로 club_members에 등록 (같은 함수 트랜잭션 내에서 처리 — 중간 실패 시 clubs insert까지 자동 롤백)
  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, v_owner_id, 'owner', 'active')
  returning * into v_member;

  -- Task008: owner의 클럽 레이팅을 클럽별 initial_rating으로 생성.
  insert into public.club_ratings (club_id, user_id, rating)
  values (v_club.id, v_owner_id, v_club.initial_rating)
  on conflict (club_id, user_id) do nothing;

  return json_build_object(
    'club', json_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'slug', v_club.slug,
      'description', v_club.description,
      'owner_id', v_club.owner_id,
      'invite_code', v_club.invite_code,
      'invite_code_enabled', v_club.invite_code_enabled,
      'plan', v_club.plan,
      'initial_rating', v_club.initial_rating,
      'logo_url', v_club.logo_url,
      'created_at', v_club.created_at,
      'updated_at', v_club.updated_at
    ),
    'membership', json_build_object(
      'id', v_member.id,
      'club_id', v_member.club_id,
      'user_id', v_member.user_id,
      'role', v_member.role,
      'status', v_member.status,
      'joined_at', v_member.joined_at
    )
  );
end;
$function$;

alter function public.create_club(text, text, text) set search_path = '';
grant execute on function public.create_club(text, text, text) to authenticated;
revoke execute on function public.create_club(text, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- join_club_with_code 확장: 가입 시 신규 멤버의 club_ratings 행을 클럽 initial_rating으로 생성.
-- 기존 로직(신원 재확인, banned/already_member 분기 등)은 100% 그대로 유지.
-- ---------------------------------------------------------------------------
create or replace function public.join_club_with_code(p_invite_code text)
 returns json
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  -- 신원은 항상 auth.uid()로 재확인한다. 호출자가 넘긴 값을 신원 근거로 쓰지 않는다
  -- (shrimp-rules.md 원칙) — 그래서 이 함수는 user_id 파라미터를 받지 않는다.
  v_user_id uuid := auth.uid();
  v_club public.clubs%rowtype;
  v_existing public.club_members%rowtype;
  v_member public.club_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_club
  from public.clubs
  where invite_code = p_invite_code
    and invite_code_enabled = true;

  if not found then
    return json_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_existing
  from public.club_members
  where club_id = v_club.id
    and user_id = v_user_id;

  if found then
    if v_existing.status = 'banned' then
      return json_build_object('success', false, 'error', 'banned');
    end if;

    return json_build_object('success', false, 'error', 'already_member');
  end if;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, v_user_id, 'member', 'active')
  returning * into v_member;

  -- Task008: 신규 멤버의 클럽 레이팅을 클럽별 initial_rating으로 생성.
  insert into public.club_ratings (club_id, user_id, rating)
  values (v_club.id, v_user_id, v_club.initial_rating)
  on conflict (club_id, user_id) do nothing;

  return json_build_object(
    'success', true,
    'club', json_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'slug', v_club.slug,
      'description', v_club.description,
      'owner_id', v_club.owner_id,
      'invite_code', v_club.invite_code,
      'invite_code_enabled', v_club.invite_code_enabled,
      'plan', v_club.plan,
      'initial_rating', v_club.initial_rating,
      'logo_url', v_club.logo_url,
      'created_at', v_club.created_at,
      'updated_at', v_club.updated_at
    ),
    'membership', json_build_object(
      'id', v_member.id,
      'club_id', v_member.club_id,
      'user_id', v_member.user_id,
      'role', v_member.role,
      'status', v_member.status,
      'joined_at', v_member.joined_at
    )
  );
end;
$function$;

alter function public.join_club_with_code(text) set search_path = '';
grant execute on function public.join_club_with_code(text) to authenticated;
revoke execute on function public.join_club_with_code(text) from anon, public;

-- ---------------------------------------------------------------------------
-- record_match_result 확장: 기존 경기 결과 기록 로직(권한 체크, 재실행 가드, walkover/games
-- 분기, 다음 라운드 진출 배정, 대회 완료 판정)은 100% 그대로 유지하고, 승자 확정 직후
-- club_ratings/rating_history 갱신을 추가한다.
--
-- 동시성 보호: 같은 매치가 동시에 두 번 처리되는 것은 이미 재실행 가드(match already
-- finalized)가 막는다. 하지만 club_ratings 행은 "이 선수가 참여한 다른 매치"와 동시에
-- 갱신될 수 있으므로, 두 선수의 club_ratings 행을 반드시 user_id 오름차순으로 `for update`
-- 잠근 뒤 rating을 읽는다(데드락 방지 — 항상 동일한 순서로 잠그면 순환 대기가 생기지 않는다).
-- ---------------------------------------------------------------------------
create or replace function public.record_match_result(p_match_id uuid, p_games jsonb, p_walkover_winner_id uuid DEFAULT NULL::uuid)
 returns json
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_club_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_tournament_id uuid;
  v_status public.match_status;
  v_match public.matches%rowtype;
  v_advanced_match public.matches%rowtype;
  v_has_advanced boolean := false;
  v_tournament_completed boolean := false;
  v_p1_wins int := 0;
  v_p2_wins int := 0;
  v_game record;
  v_winner_id uuid;
  -- Task008: ELO 레이팅 갱신용 변수.
  v_loser_id uuid;
  v_initial_rating int;
  v_winner_rating_before int;
  v_loser_rating_before int;
  v_winner_rating_after int;
  v_loser_rating_after int;
  v_expected_winner numeric;
begin
  select m.club_id, m.player1_id, m.player2_id, m.tournament_id, m.status
    into v_club_id, v_player1_id, v_player2_id, v_tournament_id, v_status
  from public.matches m
  where m.id = p_match_id;

  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 재실행(중복 클릭) 가드: 이미 completed/walkover인 매치를 다시 기록하면 아래
  -- 진출배정 UPDATE가 재실행되어, 이미 다른 경로로 진행된 다음 라운드 매치의 status를
  -- completed/in_progress에서 ready로 되돌릴 수 있다.
  if v_status in ('completed', 'walkover') then
    raise exception 'match already finalized' using errcode = '55000';
  end if;

  -- 양쪽 선수가 아직 확정되지 않은 매치(부전승/승자 진출 대기 중)는 결과를 기록할 수 없다.
  if v_player1_id is null or v_player2_id is null then
    raise exception 'match players not yet determined' using errcode = '55000';
  end if;

  -- 부전승 승자는 반드시 이 매치의 실제 두 선수 중 한 명이어야 한다. 검증 없이 그대로
  -- winner_id에 기록하면 PostgREST 직접 호출로 매치와 무관한 임의 user_id를 승자로
  -- 지정해 다음 라운드로 진출시킬 수 있다.
  if p_walkover_winner_id is not null and p_walkover_winner_id not in (v_player1_id, v_player2_id) then
    raise exception 'walkover winner must be one of the match players' using errcode = '22023';
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

  -- Task008: ELO 레이팅 갱신 -------------------------------------------------
  v_loser_id := case when v_match.winner_id = v_player1_id then v_player2_id else v_player1_id end;

  select c.initial_rating into v_initial_rating
  from public.clubs c
  where c.id = v_club_id;

  -- 두 선수의 club_ratings 행이 아직 없을 수 있으므로(예: 백필 이전 가입) 클럽
  -- initial_rating으로 먼저 보장한다. 이미 있으면 아무 것도 하지 않는다.
  insert into public.club_ratings (club_id, user_id, rating)
  values (v_club_id, v_match.winner_id, v_initial_rating), (v_club_id, v_loser_id, v_initial_rating)
  on conflict (club_id, user_id) do nothing;

  -- 데드락 방지를 위해 항상 user_id 오름차순으로 두 행을 잠근다.
  if v_match.winner_id < v_loser_id then
    select rating into v_winner_rating_before
      from public.club_ratings where club_id = v_club_id and user_id = v_match.winner_id for update;
    select rating into v_loser_rating_before
      from public.club_ratings where club_id = v_club_id and user_id = v_loser_id for update;
  else
    select rating into v_loser_rating_before
      from public.club_ratings where club_id = v_club_id and user_id = v_loser_id for update;
    select rating into v_winner_rating_before
      from public.club_ratings where club_id = v_club_id and user_id = v_match.winner_id for update;
  end if;

  -- lib/rating/elo.ts와 동일한 ELO 공식(K=32)을 plpgsql로 재구현.
  v_expected_winner := 1.0 / (1.0 + power(10.0, (v_loser_rating_before - v_winner_rating_before)::numeric / 400.0));
  v_winner_rating_after := round(v_winner_rating_before + 32 * (1 - v_expected_winner));
  v_loser_rating_after := round(v_loser_rating_before + 32 * (0 - (1 - v_expected_winner)));

  update public.club_ratings
    set rating = v_winner_rating_after,
        matches_played = matches_played + 1,
        wins = wins + 1,
        updated_at = now()
    where club_id = v_club_id and user_id = v_match.winner_id;

  update public.club_ratings
    set rating = v_loser_rating_after,
        matches_played = matches_played + 1,
        losses = losses + 1,
        updated_at = now()
    where club_id = v_club_id and user_id = v_loser_id;

  insert into public.rating_history (
    club_id, user_id, match_id, rating_before, rating_after, delta,
    opponent_id, opponent_rating_before, reason
  ) values
    (v_club_id, v_match.winner_id, p_match_id, v_winner_rating_before, v_winner_rating_after,
      v_winner_rating_after - v_winner_rating_before, v_loser_id, v_loser_rating_before, 'match_result'),
    (v_club_id, v_loser_id, p_match_id, v_loser_rating_before, v_loser_rating_after,
      v_loser_rating_after - v_loser_rating_before, v_match.winner_id, v_winner_rating_before, 'match_result');

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
    'rating_changes', json_build_array(
      json_build_object(
        'user_id', v_match.winner_id,
        'rating_before', v_winner_rating_before,
        'rating_after', v_winner_rating_after,
        'delta', v_winner_rating_after - v_winner_rating_before
      ),
      json_build_object(
        'user_id', v_loser_id,
        'rating_before', v_loser_rating_before,
        'rating_after', v_loser_rating_after,
        'delta', v_loser_rating_after - v_loser_rating_before
      )
    ),
    'tournament_completed', v_tournament_completed
  );
end;
$function$;

alter function public.record_match_result(uuid, jsonb, uuid) set search_path = '';
grant execute on function public.record_match_result(uuid, jsonb, uuid) to authenticated;
revoke execute on function public.record_match_result(uuid, jsonb, uuid) from anon, public;
