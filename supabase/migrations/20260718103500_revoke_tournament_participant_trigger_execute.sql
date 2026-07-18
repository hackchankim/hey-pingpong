-- set_tournament_participant_club_id는 tournament_participants BEFORE INSERT 트리거 전용이다.
-- handle_new_user(20260718090014)와 동일한 관례로, 트리거 밖에서 RPC로 직접 호출될 필요가 없으므로
-- public/anon/authenticated의 EXECUTE 권한을 회수한다(get_advisors security WARN 해소).
revoke execute on function public.set_tournament_participant_club_id() from public, anon, authenticated;
