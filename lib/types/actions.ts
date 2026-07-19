// Server Action / Postgres RPC 요청·응답 타입 모음.
// 실제 구현(ROADMAP Task 005~008)에서 Server Action 시그니처와 RPC 페이로드가
// 이 타입들을 그대로 사용하도록 설계 단계에서 먼저 정의한다.
// 도메인 Row 타입은 `lib/types/domain.ts`에서 가져온다.

import type {
  Club,
  ClubMember,
  Match,
  MatchBracket,
  ParticipantStatus,
  Tournament,
  TournamentFormat,
  TournamentParticipant,
} from "@/lib/types/domain"

// ---------------------------------------------------------------------------
// 클럽 생성 (F001)
// ---------------------------------------------------------------------------

export interface CreateClubInput {
  name: string
  slug: string
  description?: string | null
}

export interface CreateClubResult {
  club: Club
  /** 생성자를 owner로 등록한 club_members 행 */
  membership: ClubMember
}

// ---------------------------------------------------------------------------
// 초대코드로 클럽 가입 (F002) — join_club_with_code RPC
// ---------------------------------------------------------------------------

/**
 * RPC 파라미터. 신원은 RPC 내부에서 `auth.uid()`로 재확인하므로
 * 여기에 user_id를 포함하지 않는다 (shrimp-rules.md 원칙).
 */
export interface JoinClubWithCodeInput {
  invite_code: string
}

/**
 * join_club_with_code RPC는 "코드가 없음"과 "코드가 비활성화됨"을 구분하지 않고
 * 항상 invalid_code로 응답한다(존재 여부를 굳이 구분하지 않는 편이 보안상 안전하다는
 * 의도적 설계) — 따라서 code_disabled는 별도 값으로 두지 않는다.
 */
export type JoinClubWithCodeResult =
  | { success: true; club: Club; membership: ClubMember }
  | { success: false; error: "invalid_code" | "already_member" | "banned" }

// ---------------------------------------------------------------------------
// 대회 생성 (F004)
// ---------------------------------------------------------------------------

export interface CreateTournamentInput {
  club_id: string
  name: string
  format: TournamentFormat
  max_participants?: number | null
  registration_deadline?: string | null
  starts_at?: string | null
  ruleset?: Record<string, unknown> | null
}

export interface CreateTournamentResult {
  tournament: Tournament
}

// ---------------------------------------------------------------------------
// 대회 참가 신청 (F005)
// ---------------------------------------------------------------------------

export interface RegisterParticipantInput {
  tournament_id: string
}

export interface RegisterParticipantResult {
  participant: TournamentParticipant
}

/**
 * 관리자 전용: 참가자를 승인(pending → registered)/실격/시드 조정.
 * RLS상 관리자만 임의 상태로 전환 가능 — 본인 취소는 `WithdrawParticipantInput`으로 분리.
 */
export interface UpdateParticipantStatusInput {
  tournament_id: string
  participant_id: string
  status: Extract<ParticipantStatus, "registered" | "disqualified">
}

/** 본인 전용: 자기 자신의 참가 신청을 취소(withdrawn으로만 전환, RLS 체크 제약과 대응) */
export interface WithdrawParticipantInput {
  tournament_id: string
}

// ---------------------------------------------------------------------------
// 대진표 확정 저장 (F006) — create_tournament_matches RPC
// ---------------------------------------------------------------------------

/**
 * `lib/tournament/bracket.ts`의 순수 함수가 계산한 대진 형태를
 * RPC로 넘기기 위한 페이로드. RPC는 기존 draft 경기 삭제 → 이 배열 벌크 insert
 * → tournaments.status 전환을 하나의 트랜잭션으로 처리한다.
 */
export interface BracketMatchInput {
  bracket: MatchBracket
  round: number
  match_number: number
  player1_id?: string | null
  player2_id?: string | null
  /** 시딩 단계에서는 아직 실제 match id가 없으므로 임시 참조 키로 연결 */
  player1_source_match_ref?: string | null
  player2_source_match_ref?: string | null
  /**
   * 더블 엘리미네이션 패자조(losers bracket) 전용: 이 슬롯이 특정 매치의 "승자"가 아니라
   * "패자"로 채워져야 함을 나타내는 임시 참조 키(예: 승자조에서 패한 선수가 패자조로 진출).
   */
  player1_loser_source_match_ref?: string | null
  player2_loser_source_match_ref?: string | null
  /** 이 경기 자신을 참조하는 다른 경기들이 사용할 임시 키 */
  match_ref: string
  is_bye?: boolean
}

export interface CreateTournamentMatchesInput {
  tournament_id: string
  matches: BracketMatchInput[]
}

export interface CreateTournamentMatchesResult {
  matches: Match[]
}

// ---------------------------------------------------------------------------
// 경기 결과 기록 (F007, F008, F009) — record_match_result RPC
// ---------------------------------------------------------------------------

export interface MatchGameScoreInput {
  game_number: number
  player1_score: number
  player2_score: number
}

/**
 * 점수 입력 한 번으로 승패 판정 → 다음 라운드 진출 배정 → club_ratings/rating_history
 * 갱신까지 한 트랜잭션에서 처리하는 RPC 입력. 여러 테이블에 걸친 원자적 쓰기이므로
 * 애플리케이션 코드로 분산 구현하지 않고 이 RPC 하나로 모은다 (shrimp-rules.md 원칙).
 */
export interface RecordMatchResultInput {
  match_id: string
  games: MatchGameScoreInput[]
  /** 부전승/기권승 등 게임 점수 없이 승자만 확정하는 경우 */
  walkover_winner_id?: string | null
}

export interface RatingChangeSummary {
  user_id: string
  rating_before: number
  rating_after: number
  delta: number
}

export interface RecordMatchResultResult {
  match: Match
  /**
   * 승자/패자가 진출하는 다음 라운드 경기가 갱신된 경우 포함된다(더블 엘리미네이션은
   * 승자조 진출 + 패자조 진출이 동시에 발생할 수 있어 최대 2건까지 담긴다). 갱신된
   * 다음 경기가 없으면 빈 배열이다.
   */
  advanced_matches: Match[]
  rating_changes: RatingChangeSummary[]
  /** 이 경기 종료로 대회 전체가 완료 처리되었는지 여부 */
  tournament_completed: boolean
}
