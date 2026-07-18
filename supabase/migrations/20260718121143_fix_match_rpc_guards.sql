-- Task 007 code-reviewer 정적 리뷰 지적 사항 수정.
-- 20260718115659_create_matches_and_match_games.sql이 이미 원격에 적용되어 있으므로
-- (개발 초기 단계지만 apply_migration 히스토리에 기록됨) 기존 파일을 직접 고치지 않고
-- CREATE OR REPLACE FUNCTION으로 두 RPC만 재정의하는 새 마이그레이션을 추가한다.
-- 이렇게 하면 로컬에서 `supabase db reset`으로 전체 마이그레이션을 처음부터 재생하더라도
-- (버그 있는 버전 생성 -> 곧바로 이 파일이 고쳐진 버전으로 교체) 최종 상태는 항상 올바르다.
--
-- 1) [치명적] create_tournament_matches가 매치 생성 시 status를 절대 'ready'로 설정하지
--    않았다. INSERT의 select 절이 status 컬럼을 지정하지 않아 테이블 기본값 'pending'이
--    그대로 들어갔고, 'ready' 전환은 record_match_result의 진출배정 로직 한 곳뿐이라
--    양쪽 선수가 이미 확정된 매치(라운드로빈 전체, 싱글엘리미네이션 1라운드 실제 매치,
--    부전승끼리 만나는 2라운드 매치)조차 대회 시작 시점부터 점수를 넣을 방법이 없었다.
--    -> player1_id/player2_id가 둘 다 not null이면 'ready', 아니면 'pending'을 명시적으로
--    계산해 insert한다.
-- 2) [높음] record_match_result에 재실행(중복 클릭) 가드가 없어, 이미 completed/walkover인
--    매치에 다시 호출되면 진출배정 UPDATE가 재실행되면서 이미 다른 경로로 진행된 다음
--    라운드 매치의 status를 completed/in_progress에서 ready로 되돌릴 수 있었다.
--    -> 매치 status를 함께 조회해 completed/walkover면 즉시 예외를 던진다.
-- 3) [중간] p_walkover_winner_id가 실제 매치의 두 선수 중 하나인지 검증하지 않아,
--    PostgREST로 RPC를 직접 호출하면 매치와 무관한 임의 user_id를 승자로 지정해 다음
--    라운드로 진출시킬 수 있었다. -> v_player1_id/v_player2_id 중 하나인지 검증하고,
--    겸사겸사 양쪽 선수가 아직 확정되지 않은 매치(player1_id/player2_id가 null)에
--    결과를 기록하려는 시도도 막는다.
-- 4) [중간] create_tournament_matches가 기존 matches 상태 확인 없이 무조건 전체 삭제해,
--    향후 재생성 기능이나 실수로 재호출되면 이미 기록된 경기 결과가 통째로 사라질 위험이
--    있었다. -> tournaments.status가 draft/registration_open이 아니면(이미
--    in_progress/completed) 예외를 던지는 최소 가드를 추가한다.
--
-- 참고: is_bye 컬럼이 실제로 어느 매치에도 true로 설정되지 않는 것은 의도된 설계다.
-- 부전승 쌍(둘 중 하나가 없는 페어링)은 lib/tournament/bracket.ts에서 아예 매치 row를
-- 만들지 않고 건너뛰므로(shrimp-rules.md 원칙 — 대진표 형태 계산은 순수 함수로만), 이
-- 컬럼은 향후 수동 부전승 표시 등을 위해 스키마에만 남겨둔다.

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
  v_status public.tournament_status;
begin
  select t.club_id, t.status into v_club_id, v_status
  from public.tournaments t
  where t.id = p_tournament_id;

  if not found then
    raise exception 'tournament not found' using errcode = 'P0002';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 이미 진행중/완료된 대회는 재생성 시 이미 기록된 경기 결과가 통째로 삭제될 위험이
  -- 있으므로 막는다. 대진표는 draft/registration_open 상태에서만 (재)생성할 수 있다.
  if v_status not in ('draft', 'registration_open') then
    raise exception 'tournament already started' using errcode = '55000';
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
    is_bye,
    status
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
    coalesce((elem ->> 'is_bye')::boolean, false),
    -- 양쪽 선수가 이미 확정된 매치(라운드로빈 전체, 싱글엘리미네이션 1라운드 실제 매치,
    -- 부전승끼리 만나는 2라운드 매치)는 생성 즉시 'ready'로 시작해야 점수 입력이 가능하다.
    case
      when (elem ->> 'player1_id') is not null and (elem ->> 'player2_id') is not null
        then 'ready'::public.match_status
      else 'pending'::public.match_status
    end
  from jsonb_array_elements(p_matches) as elem;

  update public.tournaments
    set status = 'in_progress', updated_at = now()
    where id = p_tournament_id;
end;
$$;

alter function public.create_tournament_matches(uuid, jsonb) set search_path = '';
grant execute on function public.create_tournament_matches(uuid, jsonb) to authenticated;
revoke execute on function public.create_tournament_matches(uuid, jsonb) from anon, public;

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
  v_status public.match_status;
  v_match public.matches%rowtype;
  v_advanced_match public.matches%rowtype;
  v_has_advanced boolean := false;
  v_tournament_completed boolean := false;
  v_p1_wins int := 0;
  v_p2_wins int := 0;
  v_game record;
  v_winner_id uuid;
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
