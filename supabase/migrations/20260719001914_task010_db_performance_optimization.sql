-- Task 010: DB 인덱스/RLS 성능 최적화
-- get_advisors(security)/get_advisors(performance) 경고 중 안전하게 조치 가능한 항목만 처리.
-- 조치 제외 항목(의도된 설계 또는 SQL로 조치 불가)은 docs/schema-design.md "성능 점검 이력" 섹션 참고.

-- ─────────────────────────────────────────────
-- 1. FK 인덱스 8개 추가 (unindexed_foreign_keys 해소, 순수 추가라 부작용 없음)
-- ─────────────────────────────────────────────
create index if not exists idx_club_ratings_user_id on public.club_ratings(user_id);
create index if not exists idx_matches_player1_id on public.matches(player1_id);
create index if not exists idx_matches_player2_id on public.matches(player2_id);
create index if not exists idx_matches_winner_id on public.matches(winner_id);
create index if not exists idx_rating_history_match_id on public.rating_history(match_id);
create index if not exists idx_rating_history_opponent_id on public.rating_history(opponent_id);
create index if not exists idx_tournament_participants_user_id on public.tournament_participants(user_id);
create index if not exists idx_tournaments_created_by on public.tournaments(created_by);

-- ─────────────────────────────────────────────
-- 2. auth_rls_initplan 최적화 (auth.uid()를 (select auth.uid())로 감싸 per-row 재평가 방지)
--    판정 로직(권한 결과)은 변경하지 않음 — 표현만 최적화. 적용 전 pg_policies로 라이브 정의를
--    재확인해 auth.uid() 외 조건은 그대로 유지했음(단, public. 스키마 접두어는 일부 생략 —
--    search_path가 기본값인 한 이름 해석 결과는 동일하며 pg_policies 재조회로 확인함).
-- ─────────────────────────────────────────────
alter policy "profiles_update_own" on public.profiles
  using ((select auth.uid()) = id);

alter policy "clubs_insert_owner" on public.clubs
  with check (owner_id = (select auth.uid()));

alter policy "clubs_delete_owner" on public.clubs
  using (owner_id = (select auth.uid()));

alter policy "club_members_delete_admin_or_self" on public.club_members
  using ((is_club_admin(club_id) and role <> 'owner') or user_id = (select auth.uid()));

alter policy "participants_delete_admin_or_self" on public.tournament_participants
  using (is_club_admin(club_id) or user_id = (select auth.uid()));

-- ─────────────────────────────────────────────
-- 3. tournament_participants UPDATE 정책 병합 (multiple_permissive_policies 해소)
--
-- 안전성 근거: Postgres는 동일 명령(UPDATE)에 permissive 정책이 여러 개 있으면
-- 각 정책의 USING/WITH CHECK을 OR로 평가한다. 즉 두 정책이 동시에 존재하는 것과
-- (policy1_using OR policy2_using) / (policy1_with_check OR policy2_with_check)를
-- 하나의 정책으로 합치는 것은 "누가 무엇을 할 수 있는가" 관점에서 수학적으로 완전히 동일하다.
-- 기존 participants_update_admin(using/with check: is_club_admin(club_id))과
-- participants_update_self(using: user_id = auth.uid(), with check: user_id = auth.uid()
-- and status = 'withdrawn')를 OR로 합쳐 단일 정책으로 대체한다. 평가 대상 row 집합과
-- 허용 여부는 병합 전후 동일하며, 옵티마이저가 정책 하나만 평가하면 되므로 성능만 개선된다.
-- ─────────────────────────────────────────────
drop policy "participants_update_admin" on public.tournament_participants;
drop policy "participants_update_self" on public.tournament_participants;

create policy "participants_update_admin_or_self"
  on public.tournament_participants for update
  using (
    is_club_admin(club_id)
    or user_id = (select auth.uid())
  )
  with check (
    is_club_admin(club_id)
    or (user_id = (select auth.uid()) and status = 'withdrawn')
  );
