-- Task010 후속: get_advisors 재실행에서 새로 드러난 auth_rls_initplan 경고 1건 추가 최적화.
-- participants_insert_self의 판정 로직은 그대로 두고 auth.uid()만 (select auth.uid())로 감싼다.
alter policy "participants_insert_self" on public.tournament_participants
  with check (
    user_id = (select auth.uid())
    and is_club_member(club_id)
    and status = 'pending'
    and exists (
      select 1 from tournaments t
      where t.id = tournament_participants.tournament_id
        and t.status = 'registration_open'
        and (t.registration_deadline is null or t.registration_deadline > now())
    )
  );
