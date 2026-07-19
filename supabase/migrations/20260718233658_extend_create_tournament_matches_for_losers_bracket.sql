-- create_tournament_matches를 확장해 더블 엘리미네이션 패자조 진출 참조
-- (player1_loser_source_match_id/player2_loser_source_match_id)도 함께 insert하도록 한다.
-- 나머지 로직(권한 체크, 상태 가드, draft 삭제, tournaments.status 전환)은 라이브 정의 그대로 유지.
CREATE OR REPLACE FUNCTION public.create_tournament_matches(p_tournament_id uuid, p_matches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    player1_loser_source_match_id,
    player2_loser_source_match_id,
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
    (elem ->> 'player1_loser_source_match_ref')::uuid,
    (elem ->> 'player2_loser_source_match_ref')::uuid,
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
$function$
