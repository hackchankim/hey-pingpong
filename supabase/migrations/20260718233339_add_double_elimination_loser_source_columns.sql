-- 더블 엘리미네이션 패자조(losers bracket) 진출 배정을 위한 컬럼 추가.
-- player1_source_match_id/player2_source_match_id와 동일한 패턴: 대진표 확정 시점에는
-- 참조 대상 매치가 아직 insert되지 않았을 수 있으므로 deferrable initially deferred로
-- 같은 트랜잭션 내 순환/전방 참조를 허용한다.
alter table public.matches
  add column player1_loser_source_match_id uuid references public.matches(id) deferrable initially deferred,
  add column player2_loser_source_match_id uuid references public.matches(id) deferrable initially deferred;

create index idx_matches_player1_loser_source_match_id
  on public.matches using btree (player1_loser_source_match_id);

create index idx_matches_player2_loser_source_match_id
  on public.matches using btree (player2_loser_source_match_id);
