-- 정적 리뷰 지적사항 해소: club_members_update_admin / clubs_update_admin UPDATE 정책에
-- WITH CHECK가 없어서 admin이 PostgREST(supabase-js)로 직접 role='owner' 승격이나
-- owner_id 탈취를 시도할 수 있었다. Postgres RLS 규칙상 WITH CHECK를 지정하지 않으면
-- USING이 그대로 재사용되므로, USING(is_club_admin(...))만으로는 role/owner_id 컬럼
-- 값 자체를 제한하지 못한다. 20260718085935에서 생성된 정책들은 이미 적용된 상태이므로
-- 그대로 두고, 이 후속 마이그레이션에서 ALTER POLICY로 강화한다.

-- club_members_update_admin: owner 행 자체를 대상으로 UPDATE를 시도조차 못하게(USING) +
-- 업데이트 결과 role이 owner가 되는 것도 막는다(WITH CHECK). 두 조건을 동일하게 걸어
-- "owner 행 자체를 건드릴 수 없고, 어떤 행도 owner로 바꿀 수 없다"를 이중으로 보장한다.
alter policy "club_members_update_admin"
  on public.club_members
  using (public.is_club_admin(club_id) and role <> 'owner')
  with check (public.is_club_admin(club_id) and role <> 'owner');

-- club_members_delete_admin_or_self: admin이 owner를 강제 축출하는 것을 DB 레벨에서도
-- 막는다(애플리케이션 레이어의 removeMember 가드와 별개의 이중 방어). 본인이 owner인
-- 경우의 자진 탈퇴(user_id = auth.uid())는 그대로 허용한다.
alter policy "club_members_delete_admin_or_self"
  on public.club_members
  using (
    (public.is_club_admin(club_id) and role <> 'owner')
    or user_id = auth.uid()
  );

-- clubs_update_admin: owner_id는 이 정책으로는 절대 변경할 수 없도록 제한한다(소유권
-- 이전은 이번 스코프 밖 — 전용 RPC가 생기기 전까지 owner_id는 사실상 불변으로 취급).
-- WITH CHECK 표현식은 갱신될 새 행(NEW) 기준으로 평가된다. 아래 서브쿼리는 같은 테이블을
-- PK로 다시 조회하는데, 같은 UPDATE 커맨드 내에서 자기 자신이 만든 변경은 그 커맨드의
-- 다른 서브플랜에 보이지 않는다는 Postgres MVCC 커맨드 가시성 규칙에 따라 갱신 이전(OLD)
-- 값을 반환한다 — 이를 이용해 owner_id 불변을 강제하는 표준적인 RLS 패턴이다.
alter policy "clubs_update_admin"
  on public.clubs
  using (public.is_club_admin(id))
  with check (
    public.is_club_admin(id)
    and owner_id = (select c.owner_id from public.clubs c where c.id = clubs.id)
  );
