// 이 파일은 **수기 관리하는 도메인 타입**이며, Supabase CLI가 자동 생성하는
// `lib/types/database.types.ts`와는 별개다. 실제 테이블이 마이그레이션으로 생성되기 전
// (ROADMAP Task 005~008) 설계 단계에서 UI/Server Action이 참조할 타입을 먼저 정의한다.
// `database.types.ts`가 생성된 이후에는 점진적으로 `Tables<'clubs'>` 등으로 대체할 수 있다.

/** 클럽 내 역할 */
export type ClubRole = "owner" | "admin" | "member"

/** 클럽 멤버십 상태 */
export type MemberStatus = "active" | "banned"

/** 대회 진행 방식 */
export type TournamentFormat =
  | "round_robin"
  | "single_elimination"
  | "double_elimination"

/** 대회 진행 상태 */
export type TournamentStatus =
  | "draft"
  | "registration_open"
  | "in_progress"
  | "completed"
  | "cancelled"

/** 대회 참가자 상태 (pending=신청, registered=승인) */
export type ParticipantStatus =
  | "pending"
  | "registered"
  | "checked_in"
  | "withdrawn"
  | "disqualified"

/** 경기가 속한 대진 트리 구분 (더블 엘리미네이션 대비) */
export type MatchBracket = "main" | "winners" | "losers"

/** 경기 진행 상태 */
export type MatchStatus =
  | "pending" // 아직 이전 라운드 결과가 없어 대기 중 (엘리미네이션 진출 대기)
  | "ready" // 양쪽 선수가 확정되어 진행 가능
  | "in_progress"
  | "completed"
  | "walkover" // 부전승/기권승

/** 레이팅 변동 사유 */
export type RatingChangeReason = "match_result" | "manual_adjustment"

// ---------------------------------------------------------------------------
// clubs
// ---------------------------------------------------------------------------

/** 구장(클럽) */
export interface Club {
  id: string
  name: string
  slug: string
  description: string | null
  owner_id: string
  invite_code: string
  invite_code_enabled: boolean
  plan: string
  initial_rating: number
  logo_url: string | null
  created_at: string
  updated_at: string
}

export interface ClubInsert {
  id?: string
  name: string
  slug: string
  description?: string | null
  owner_id: string
  invite_code: string
  invite_code_enabled?: boolean
  plan?: string
  initial_rating?: number
  logo_url?: string | null
  created_at?: string
  updated_at?: string
}

export type ClubUpdate = Partial<Omit<ClubInsert, "id">>

// ---------------------------------------------------------------------------
// club_members
// ---------------------------------------------------------------------------

/** 클럽 멤버십 */
export interface ClubMember {
  id: string
  club_id: string
  user_id: string
  role: ClubRole
  status: MemberStatus
  joined_at: string
}

export interface ClubMemberInsert {
  id?: string
  club_id: string
  user_id: string
  role?: ClubRole
  status?: MemberStatus
  joined_at?: string
}

export type ClubMemberUpdate = Partial<Omit<ClubMemberInsert, "id" | "club_id" | "user_id">>

// ---------------------------------------------------------------------------
// tournaments
// ---------------------------------------------------------------------------

/** 대회 */
export interface Tournament {
  id: string
  club_id: string
  name: string
  format: TournamentFormat
  status: TournamentStatus
  max_participants: number | null
  registration_deadline: string | null
  starts_at: string | null
  created_by: string
  /** 대회별 규칙(세트 수, 듀스 여부 등)을 자유 형식으로 저장 */
  ruleset: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TournamentInsert {
  id?: string
  club_id: string
  name: string
  format: TournamentFormat
  status?: TournamentStatus
  max_participants?: number | null
  registration_deadline?: string | null
  starts_at?: string | null
  created_by: string
  ruleset?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type TournamentUpdate = Partial<Omit<TournamentInsert, "id" | "club_id">>

// ---------------------------------------------------------------------------
// tournament_participants
// ---------------------------------------------------------------------------

/** 대회 참가자 */
export interface TournamentParticipant {
  id: string
  tournament_id: string
  /** clubs.id 비정규화 — RLS를 조인 없이 club_id 등호로 체크하기 위함 */
  club_id: string
  user_id: string
  seed: number | null
  rating_at_registration: number | null
  status: ParticipantStatus
  final_rank: number | null
  created_at: string
}

export interface TournamentParticipantInsert {
  id?: string
  tournament_id: string
  club_id: string
  user_id: string
  seed?: number | null
  rating_at_registration?: number | null
  status?: ParticipantStatus
  final_rank?: number | null
  created_at?: string
}

export type TournamentParticipantUpdate = Partial<
  Omit<TournamentParticipantInsert, "id" | "tournament_id" | "club_id" | "user_id">
>

// ---------------------------------------------------------------------------
// matches
// ---------------------------------------------------------------------------

/** 경기 (대진표의 한 칸) */
export interface Match {
  id: string
  tournament_id: string
  /** clubs.id 비정규화 */
  club_id: string
  bracket: MatchBracket
  round: number
  match_number: number
  player1_id: string | null
  player2_id: string | null
  /** 엘리미네이션에서 이전 라운드 승자가 여기로 진출함을 나타내는 자기참조 FK */
  player1_source_match_id: string | null
  player2_source_match_id: string | null
  is_bye: boolean
  status: MatchStatus
  winner_id: string | null
  /** match_games 집계 캐시 (비정규화) */
  player1_games_won: number
  player2_games_won: number
  scheduled_at: string | null
  court_label: string | null
  created_at: string
  updated_at: string
}

export interface MatchInsert {
  id?: string
  tournament_id: string
  club_id: string
  bracket?: MatchBracket
  round: number
  match_number: number
  player1_id?: string | null
  player2_id?: string | null
  player1_source_match_id?: string | null
  player2_source_match_id?: string | null
  is_bye?: boolean
  status?: MatchStatus
  winner_id?: string | null
  player1_games_won?: number
  player2_games_won?: number
  scheduled_at?: string | null
  court_label?: string | null
  created_at?: string
  updated_at?: string
}

export type MatchUpdate = Partial<Omit<MatchInsert, "id" | "tournament_id" | "club_id">>

// ---------------------------------------------------------------------------
// match_games
// ---------------------------------------------------------------------------

/** 경기 내 세트(게임)별 점수 */
export interface MatchGame {
  id: string
  match_id: string
  /** matches.club_id 비정규화 — shrimp-rules.md 규칙에 따라 조인 없이 RLS 등호 비교 */
  club_id: string
  game_number: number
  player1_score: number
  player2_score: number
  created_at: string
}

export interface MatchGameInsert {
  id?: string
  match_id: string
  club_id: string
  game_number: number
  player1_score: number
  player2_score: number
  created_at?: string
}

export type MatchGameUpdate = Partial<Omit<MatchGameInsert, "id" | "match_id">>

// ---------------------------------------------------------------------------
// club_ratings
// ---------------------------------------------------------------------------

/** 클럽별 회원 레이팅(ELO) 현황 */
export interface ClubRating {
  id: string
  club_id: string
  user_id: string
  rating: number
  matches_played: number
  wins: number
  losses: number
  updated_at: string
}

export interface ClubRatingInsert {
  id?: string
  club_id: string
  user_id: string
  rating?: number
  matches_played?: number
  wins?: number
  losses?: number
  updated_at?: string
}

export type ClubRatingUpdate = Partial<
  Omit<ClubRatingInsert, "id" | "club_id" | "user_id">
>

// ---------------------------------------------------------------------------
// rating_history
// ---------------------------------------------------------------------------

/** 레이팅 변동 이력 (경기 1건당 관련자 각각 1행) */
export interface RatingHistory {
  id: string
  club_id: string
  user_id: string
  match_id: string | null
  rating_before: number
  rating_after: number
  delta: number
  opponent_id: string | null
  opponent_rating_before: number | null
  reason: RatingChangeReason
  created_at: string
}

export interface RatingHistoryInsert {
  id?: string
  club_id: string
  user_id: string
  match_id?: string | null
  rating_before: number
  rating_after: number
  delta: number
  opponent_id?: string | null
  opponent_rating_before?: number | null
  reason?: RatingChangeReason
  created_at?: string
}
