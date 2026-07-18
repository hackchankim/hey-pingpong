// ELO 레이팅 계산 공식의 정본(canonical) 문서.
//
// 이 파일은 순수 TypeScript 함수만 담으며 Supabase/DB 접근을 절대 포함하지 않는다
// (shrimp-rules.md "대진표/랭킹 로직 배치 규칙" — ELO 계산은 이 파일에만 둔다).
//
// 중요: 이 공식은 `record_match_result` RPC 내부에 plpgsql로 동일하게 재구현되어 있고,
// 실제 club_ratings/rating_history 갱신은 그 RPC가 담당한다. 레이팅 갱신은 "그 시점의
// 최신 rating 값을 DB에서 원자적으로 읽고(row-level lock) 써야 하는" 상태 기반 로직이라,
// 만약 TS에서 계산한 결과를 RPC로 그대로 넘기는 방식을 쓰면 두 매치가 동시에 같은 선수의
// 레이팅을 갱신할 때(동시성) TS가 계산 시점에 읽은 rating이 이미 stale해질 수 있어
// 레이스 컨디션이 발생한다. 따라서 이 파일은 "알고리즘이 무엇인지"를 검증·문서화하는
// 정본 역할만 하고, 실제 프로덕션 갱신 경로는 항상 RPC(SQL)를 거친다.

/** record_match_result RPC와 동일하게 사용하는 K-factor 상수 */
export const ELO_K_FACTOR = 32

export interface EloCalculationResult {
  winnerRatingAfter: number
  loserRatingAfter: number
  winnerDelta: number
  loserDelta: number
}

/**
 * 승자/패자의 대국 전 레이팅으로부터 대국 후 레이팅을 계산한다.
 *
 * - expectedWinner = 1 / (1 + 10^((loserRating - winnerRating) / 400))
 * - winnerRatingAfter = round(winnerRating + K * (1 - expectedWinner))
 * - loserRatingAfter = round(loserRating + K * (0 - (1 - expectedWinner)))
 *
 * 클럽별 초기 레이팅(`clubs.initial_rating`)은 이 함수의 관심사가 아니다 — 호출자가
 * DB에서 조회한 현재 rating을 그대로 넘겨야 하며, 이 파일에 초기 레이팅을 하드코딩하지 않는다.
 */
export function calculateEloRatings(
  winnerRating: number,
  loserRating: number,
  kFactor: number = ELO_K_FACTOR,
): EloCalculationResult {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400))

  const winnerRatingAfter = Math.round(winnerRating + kFactor * (1 - expectedWinner))
  const loserRatingAfter = Math.round(loserRating + kFactor * (0 - (1 - expectedWinner)))

  return {
    winnerRatingAfter,
    loserRatingAfter,
    winnerDelta: winnerRatingAfter - winnerRating,
    loserDelta: loserRatingAfter - loserRating,
  }
}
