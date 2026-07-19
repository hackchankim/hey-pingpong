-- record_match_result를 확장한다:
--   1) 취소된(cancelled) 대회에는 결과 기록을 막는다.
--   2) 승자 진출 배정과 동일한 구조로 패자조(losers bracket) 진출 배정을 추가한다.
--   3) advanced_match(단수) -> advanced_matches(복수 배열)로 반환값을 바꾼다.
-- ELO/레이팅 갱신 블록(club_ratings upsert, FOR UPDATE 잠금, rating_history insert)은
-- 원본 그대로 한 글자도 수정하지 않았다.
CREATE OR REPLACE FUNCTION public.record_match_result(p_match_id uuid, p_games jsonb, p_walkover_winner_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_tournament_id uuid;
  v_status public.match_status;
  v_tournament_status public.tournament_status;
  v_match public.matches%rowtype;
  v_advanced_match public.matches%rowtype;
  v_advanced_matches public.matches[];
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
  select m.club_id, m.player1_id, m.player2_id, m.tournament_id, m.status, t.status
    into v_club_id, v_player1_id, v_player2_id, v_tournament_id, v_status, v_tournament_status
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id;

  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 취소된 대회는 더 이상 경기 결과를 기록할 수 없다.
  if v_tournament_status = 'cancelled' then
    raise exception 'tournament is cancelled' using errcode = '55000';
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

  -- 다음 라운드 진출 배정(승자조): 이 경기를 player1_source_match_id 또는 player2_source_match_id로
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
  if v_has_advanced then
    if v_advanced_match.player1_id is not null and v_advanced_match.player2_id is not null then
      update public.matches
        set status = 'ready', updated_at = now()
        where id = v_advanced_match.id
        returning * into v_advanced_match;
    end if;

    v_advanced_matches := array_append(v_advanced_matches, v_advanced_match);
  end if;

  -- 다음 라운드 진출 배정(패자조, 더블 엘리미네이션): 이 경기를 player1_loser_source_match_id
  -- 또는 player2_loser_source_match_id로 참조하는 다음 경기가 있으면(정확히 하나만 매칭됨)
  -- 패자를 채워 넣는다. v_loser_id는 위 ELO 블록에서 이미 계산된 값을 그대로 재사용한다.
  v_has_advanced := false;

  update public.matches
    set player1_id = v_loser_id, updated_at = now()
    where player1_loser_source_match_id = p_match_id
    returning * into v_advanced_match;

  if found then
    v_has_advanced := true;
  else
    update public.matches
      set player2_id = v_loser_id, updated_at = now()
      where player2_loser_source_match_id = p_match_id
      returning * into v_advanced_match;

    if found then
      v_has_advanced := true;
    end if;
  end if;

  -- 갱신된 다음 경기의 양쪽 선수가 모두 채워졌으면 진행 가능 상태로 전환한다.
  if v_has_advanced then
    if v_advanced_match.player1_id is not null and v_advanced_match.player2_id is not null then
      update public.matches
        set status = 'ready', updated_at = now()
        where id = v_advanced_match.id
        returning * into v_advanced_match;
    end if;

    v_advanced_matches := array_append(v_advanced_matches, v_advanced_match);
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
    'advanced_matches', (select coalesce(json_agg(row_to_json(m)), '[]'::json) from unnest(v_advanced_matches) as m),
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
$function$
