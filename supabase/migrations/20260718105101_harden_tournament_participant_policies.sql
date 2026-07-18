-- code-reviewer 정적 리뷰 지적 사항(Task005와 동일 계열의 RLS 결함) 수정.
--
-- 1) participants_insert_self / participants_update_self가 seed·rating_at_registration·
--    final_rank를 보호하지 않아, 본인 경로(PostgREST 직접 호출)로 시드/최종순위를 스스로
--    주입/조작할 수 있었다. -> BEFORE INSERT OR UPDATE 트리거에서 비관리자 경로일 때
--    이 세 컬럼을 항상 null(INSERT)/OLD 값(UPDATE)으로 되돌린다.
-- 2) tournament_participants의 club_id/tournament_id/user_id가 UPDATE에서 불변으로
--    보장되지 않았다(관리자가 다른 클럽/대회/사용자로 재소속시킬 수 있었음). -> 같은
--    트리거에서 UPDATE 시 항상 OLD 값으로 고정한다.
-- 3) tournaments.club_id도 UPDATE에서 불변이 보장되지 않았다(두 클럽 모두의 관리자면
--    다른 클럽으로 재소속 가능). -> tournaments_update_admin 정책에 Task005
--    clubs_update_admin과 동일한 서브쿼리 패턴을 추가.
-- 4) registerParticipant Server Action의 "모집중 + 마감 전" 체크가 애플리케이션에만
--    있어 PostgREST 직접 호출로 우회 가능했다. -> participants_insert_self WITH CHECK에
--    동일 조건의 서브쿼리를 추가.

-- (1)+(2) tournament_participants 통합 트리거 -------------------------------
drop trigger if exists trg_set_tournament_participant_club_id on public.tournament_participants;
drop function if exists public.set_tournament_participant_club_id();

create or replace function public.enforce_tournament_participant_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_admin boolean;
begin
  if tg_op = 'INSERT' then
    -- club_id는 클라이언트 입력을 무시하고 tournament_id로부터 항상 재계산한다.
    select t.club_id into new.club_id
    from public.tournaments t
    where t.id = new.tournament_id;

    is_admin := public.is_club_admin(new.club_id);

    if not is_admin then
      -- 본인 신청 경로: 시드/레이팅 스냅샷/최종순위는 항상 비워 자가 유리한 값 주입을 막는다.
      new.seed := null;
      new.rating_at_registration := null;
      new.final_rank := null;
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    -- club_id/tournament_id/user_id는 UPDATE 경로(관리자 포함)에서 항상 불변으로 고정한다.
    new.club_id := old.club_id;
    new.tournament_id := old.tournament_id;
    new.user_id := old.user_id;

    is_admin := public.is_club_admin(new.club_id);

    if not is_admin then
      -- 본인 취소 등 비관리자 경로: 시드/레이팅 스냅샷/최종순위는 손댈 수 없다.
      new.seed := old.seed;
      new.rating_at_registration := old.rating_at_registration;
      new.final_rank := old.final_rank;
    end if;

    return new;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_tournament_participant_integrity
  before insert or update on public.tournament_participants
  for each row
  execute function public.enforce_tournament_participant_integrity();

-- 트리거 전용 함수: PostgREST RPC로 직접 호출될 필요 없음(handle_new_user와 동일 관례).
revoke execute on function public.enforce_tournament_participant_integrity()
  from public, anon, authenticated;

-- (4) 참가 신청 시간창을 DB 레벨에서도 강제 -----------------------------------
drop policy "participants_insert_self" on public.tournament_participants;

create policy "participants_insert_self"
  on public.tournament_participants for insert
  with check (
    user_id = auth.uid()
    and public.is_club_member(club_id)
    and status = 'pending'
    and exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.status = 'registration_open'
        and (t.registration_deadline is null or t.registration_deadline > now())
    )
  );

-- (3) tournaments.club_id UPDATE 불변성 강제 ----------------------------------
drop policy "tournaments_update_admin" on public.tournaments;

create policy "tournaments_update_admin"
  on public.tournaments for update
  using (public.is_club_admin(club_id))
  with check (
    public.is_club_admin(club_id)
    and club_id = (select t.club_id from public.tournaments t where t.id = tournaments.id)
  );
