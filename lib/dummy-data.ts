// 이 파일은 UI 마크업/스타일링 작업(Task 003~004)을 위한 더미 데이터 모음이다.
// 실제 Supabase 데이터 연동(Task 005~008)이 완료되기 전까지 화면 구성을 검증하는 용도로만 사용한다.
// `lib/types/domain.ts`에 정의된 타입을 그대로 사용하며, 타입을 재정의하지 않는다.

import type {
  Club,
  ClubMember,
  ClubRating,
  Match,
  MatchGame,
  Tournament,
  TournamentParticipant,
} from "@/lib/types/domain"

/**
 * 화면 표시용 더미 사용자.
 * 이 프로젝트엔 아직 실제 `profiles` 데이터가 없으므로, `user_id` 필드와 매핑해
 * 이름을 표시할 때 사용하는 보조 타입이다. `profiles` 테이블 스키마와는 무관하다.
 */
export interface DummyUser {
  id: string
  name: string
}

export const dummyUsers: DummyUser[] = [
  { id: "user-1", name: "김민준" },
  { id: "user-2", name: "이서연" },
  { id: "user-3", name: "박도윤" },
  { id: "user-4", name: "최지우" },
  { id: "user-5", name: "정하은" },
  { id: "user-6", name: "강태민" },
]

/** 컴포넌트에서 `user_id -> 이름` 매핑이 필요할 때 바로 쓸 수 있는 Record */
export const dummyUserNames: Record<string, string> = Object.fromEntries(
  dummyUsers.map((user) => [user.id, user.name]),
)

export const dummyClubs: Club[] = [
  {
    id: "club-1",
    name: "강남 탁구 동호회",
    slug: "gangnam-tabletennis",
    description: "매주 화/목 강남 스포츠센터에서 모이는 탁구 동호회입니다.",
    owner_id: "user-1",
    invite_code: "GANGNAM1",
    invite_code_enabled: true,
    plan: "free",
    initial_rating: 1200,
    logo_url: null,
    created_at: "2024-11-01T09:00:00.000Z",
    updated_at: "2025-06-01T09:00:00.000Z",
  },
  {
    id: "club-2",
    name: "판교 스매시 클럽",
    slug: "pangyo-smash",
    description: "판교 테크노밸리 직장인 위주의 실력파 탁구 클럽입니다.",
    owner_id: "user-2",
    invite_code: "PANGYO22",
    invite_code_enabled: true,
    plan: "pro",
    initial_rating: 1200,
    logo_url: null,
    created_at: "2024-12-10T09:00:00.000Z",
    updated_at: "2025-05-20T09:00:00.000Z",
  },
  {
    id: "club-3",
    name: "홍대 핑퐁 크루",
    slug: "hongdae-pingpong",
    description: "초보 환영! 즐겁게 탁구 치는 걸 목표로 하는 모임입니다.",
    owner_id: "user-3",
    invite_code: "HONGDAE3",
    invite_code_enabled: false,
    plan: "free",
    initial_rating: 1000,
    logo_url: null,
    created_at: "2025-02-05T09:00:00.000Z",
    updated_at: "2025-06-15T09:00:00.000Z",
  },
  {
    id: "club-4",
    name: "분당 탁구인",
    slug: "bundang-tabletennis",
    description: "분당 지역 생활체육 탁구 동호회, 매달 정기 리그를 운영합니다.",
    owner_id: "user-4",
    invite_code: "BUNDANG4",
    invite_code_enabled: true,
    plan: "free",
    initial_rating: 1200,
    logo_url: null,
    created_at: "2025-03-20T09:00:00.000Z",
    updated_at: "2025-06-25T09:00:00.000Z",
  },
]

export const dummyClubMembers: ClubMember[] = [
  {
    id: "member-1",
    club_id: "club-1",
    user_id: "user-1",
    role: "owner",
    status: "active",
    joined_at: "2024-11-01T09:00:00.000Z",
  },
  {
    id: "member-2",
    club_id: "club-1",
    user_id: "user-2",
    role: "admin",
    status: "active",
    joined_at: "2024-11-03T09:00:00.000Z",
  },
  {
    id: "member-3",
    club_id: "club-1",
    user_id: "user-3",
    role: "member",
    status: "active",
    joined_at: "2024-11-10T09:00:00.000Z",
  },
  {
    id: "member-4",
    club_id: "club-1",
    user_id: "user-4",
    role: "member",
    status: "active",
    joined_at: "2025-01-05T09:00:00.000Z",
  },
  {
    id: "member-5",
    club_id: "club-1",
    user_id: "user-5",
    role: "member",
    status: "banned",
    joined_at: "2025-02-01T09:00:00.000Z",
  },
  {
    id: "member-6",
    club_id: "club-1",
    user_id: "user-6",
    role: "member",
    status: "active",
    joined_at: "2025-03-15T09:00:00.000Z",
  },
]

export const dummyTournaments: Tournament[] = [
  {
    id: "tournament-1",
    club_id: "club-1",
    name: "2025 강남 탁구 동호회 정기전",
    format: "single_elimination",
    status: "in_progress",
    max_participants: 16,
    registration_deadline: "2025-06-20T15:00:00.000Z",
    starts_at: "2025-06-28T09:00:00.000Z",
    created_by: "user-1",
    ruleset: { sets: 5, deuce: true },
    created_at: "2025-06-01T09:00:00.000Z",
    updated_at: "2025-06-28T10:00:00.000Z",
  },
  {
    id: "tournament-2",
    club_id: "club-1",
    name: "강남 클럽 리그전 시즌1",
    format: "round_robin",
    status: "registration_open",
    max_participants: 8,
    registration_deadline: "2025-07-25T15:00:00.000Z",
    starts_at: "2025-08-02T09:00:00.000Z",
    created_by: "user-1",
    ruleset: { sets: 3, deuce: true },
    created_at: "2025-07-01T09:00:00.000Z",
    updated_at: "2025-07-10T09:00:00.000Z",
  },
  {
    id: "tournament-3",
    club_id: "club-2",
    name: "판교 스매시 오픈",
    format: "double_elimination",
    status: "draft",
    max_participants: 32,
    registration_deadline: null,
    starts_at: null,
    created_by: "user-2",
    ruleset: null,
    created_at: "2025-07-05T09:00:00.000Z",
    updated_at: "2025-07-05T09:00:00.000Z",
  },
  {
    id: "tournament-4",
    club_id: "club-1",
    name: "2024 연말 결산 대회",
    format: "single_elimination",
    status: "completed",
    max_participants: 16,
    registration_deadline: "2024-12-10T15:00:00.000Z",
    starts_at: "2024-12-20T09:00:00.000Z",
    created_by: "user-1",
    ruleset: { sets: 5, deuce: true },
    created_at: "2024-12-01T09:00:00.000Z",
    updated_at: "2024-12-20T18:00:00.000Z",
  },
]

export const dummyParticipants: TournamentParticipant[] = [
  {
    id: "participant-1",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-1",
    seed: 1,
    rating_at_registration: 1450,
    status: "registered",
    final_rank: null,
    created_at: "2025-06-15T09:00:00.000Z",
  },
  {
    id: "participant-2",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-2",
    seed: 2,
    rating_at_registration: 1390,
    status: "registered",
    final_rank: null,
    created_at: "2025-06-15T09:10:00.000Z",
  },
  {
    id: "participant-3",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-3",
    seed: 3,
    rating_at_registration: 1325,
    status: "checked_in",
    final_rank: null,
    created_at: "2025-06-16T09:00:00.000Z",
  },
  {
    id: "participant-4",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-6",
    seed: 4,
    rating_at_registration: 1150,
    status: "registered",
    final_rank: null,
    created_at: "2025-06-17T09:00:00.000Z",
  },
  // user-4/user-5는 대진표에 배정되지 않은 "신청 대기"/"기권" 상태 예시
  // (participant-list의 pending/withdrawn 배지 표시용, 어떤 match에도 등장하지 않음)
  {
    id: "participant-5",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-4",
    seed: null,
    rating_at_registration: 1210,
    status: "pending",
    final_rank: null,
    created_at: "2025-06-18T09:00:00.000Z",
  },
  {
    id: "participant-6",
    tournament_id: "tournament-1",
    club_id: "club-1",
    user_id: "user-5",
    seed: null,
    rating_at_registration: 1180,
    status: "withdrawn",
    final_rank: null,
    created_at: "2025-06-19T09:00:00.000Z",
  },
]

// 4강 싱글 엘리미네이션(1라운드 2경기 → 2라운드 1경기), 참가자는 전부
// registered/checked_in 상태인 인원만 배정한다. games_won 캐시는 아래
// dummyMatchGames 세트 수/승패와 정확히 일치하도록 유지한다.
export const dummyMatches: Match[] = [
  {
    id: "match-1",
    tournament_id: "tournament-1",
    club_id: "club-1",
    bracket: "main",
    round: 1,
    match_number: 1,
    player1_id: "user-1",
    player2_id: "user-2",
    player1_source_match_id: null,
    player2_source_match_id: null,
    is_bye: false,
    status: "completed",
    winner_id: "user-1",
    player1_games_won: 2,
    player2_games_won: 1,
    scheduled_at: "2025-06-28T09:00:00.000Z",
    court_label: "1번 코트",
    created_at: "2025-06-20T09:00:00.000Z",
    updated_at: "2025-06-28T10:30:00.000Z",
  },
  {
    id: "match-2",
    tournament_id: "tournament-1",
    club_id: "club-1",
    bracket: "main",
    round: 1,
    match_number: 2,
    player1_id: "user-3",
    player2_id: "user-6",
    player1_source_match_id: null,
    player2_source_match_id: null,
    is_bye: false,
    status: "completed",
    winner_id: "user-3",
    player1_games_won: 2,
    player2_games_won: 0,
    scheduled_at: "2025-06-28T10:00:00.000Z",
    court_label: "2번 코트",
    created_at: "2025-06-20T09:00:00.000Z",
    updated_at: "2025-06-28T11:15:00.000Z",
  },
  {
    id: "match-3",
    tournament_id: "tournament-1",
    club_id: "club-1",
    bracket: "main",
    round: 2,
    match_number: 1,
    player1_id: "user-1",
    player2_id: "user-3",
    player1_source_match_id: "match-1",
    player2_source_match_id: "match-2",
    is_bye: false,
    status: "in_progress",
    winner_id: null,
    player1_games_won: 1,
    player2_games_won: 1,
    scheduled_at: "2025-06-28T13:00:00.000Z",
    court_label: "1번 코트",
    created_at: "2025-06-20T09:00:00.000Z",
    updated_at: "2025-06-28T13:40:00.000Z",
  },
]

export const dummyMatchGames: MatchGame[] = [
  {
    id: "game-1",
    match_id: "match-1",
    club_id: "club-1",
    game_number: 1,
    player1_score: 11,
    player2_score: 8,
    created_at: "2025-06-28T09:05:00.000Z",
  },
  {
    id: "game-2",
    match_id: "match-1",
    club_id: "club-1",
    game_number: 2,
    player1_score: 9,
    player2_score: 11,
    created_at: "2025-06-28T09:15:00.000Z",
  },
  {
    id: "game-3",
    match_id: "match-1",
    club_id: "club-1",
    game_number: 3,
    player1_score: 11,
    player2_score: 6,
    created_at: "2025-06-28T09:25:00.000Z",
  },
  {
    id: "game-4",
    match_id: "match-2",
    club_id: "club-1",
    game_number: 1,
    player1_score: 11,
    player2_score: 9,
    created_at: "2025-06-28T10:05:00.000Z",
  },
  {
    id: "game-5",
    match_id: "match-2",
    club_id: "club-1",
    game_number: 2,
    player1_score: 11,
    player2_score: 7,
    created_at: "2025-06-28T10:15:00.000Z",
  },
  {
    id: "game-6",
    match_id: "match-3",
    club_id: "club-1",
    game_number: 1,
    player1_score: 11,
    player2_score: 9,
    created_at: "2025-06-28T13:05:00.000Z",
  },
  {
    id: "game-7",
    match_id: "match-3",
    club_id: "club-1",
    game_number: 2,
    player1_score: 8,
    player2_score: 11,
    created_at: "2025-06-28T13:20:00.000Z",
  },
]

/**
 * slug로 더미 클럽을 조회한다.
 * 실제 Supabase 조회 로직(Task 005 이후)이 들어오기 전까지의 임시 방편이며,
 * 일치하는 클럽이 없으면 첫 번째 더미 클럽으로 폴백한다.
 */
export function findClubBySlug(slug: string): Club {
  return dummyClubs.find((club) => club.slug === slug) ?? dummyClubs[0]
}

export const dummyClubRatings: ClubRating[] = [
  {
    id: "rating-1",
    club_id: "club-1",
    user_id: "user-1",
    rating: 1450,
    matches_played: 12,
    wins: 9,
    losses: 3,
    updated_at: "2025-06-28T11:00:00.000Z",
  },
  {
    id: "rating-2",
    club_id: "club-1",
    user_id: "user-2",
    rating: 1390,
    matches_played: 10,
    wins: 7,
    losses: 3,
    updated_at: "2025-06-28T11:00:00.000Z",
  },
  {
    id: "rating-3",
    club_id: "club-1",
    user_id: "user-3",
    rating: 1325,
    matches_played: 15,
    wins: 8,
    losses: 7,
    updated_at: "2025-06-28T11:00:00.000Z",
  },
  {
    id: "rating-4",
    club_id: "club-1",
    user_id: "user-4",
    rating: 1210,
    matches_played: 8,
    wins: 3,
    losses: 5,
    updated_at: "2025-06-20T11:00:00.000Z",
  },
  {
    id: "rating-5",
    club_id: "club-1",
    user_id: "user-5",
    rating: 1180,
    matches_played: 6,
    wins: 2,
    losses: 4,
    updated_at: "2025-06-18T11:00:00.000Z",
  },
  {
    id: "rating-6",
    club_id: "club-1",
    user_id: "user-6",
    rating: 1150,
    matches_played: 5,
    wins: 1,
    losses: 4,
    updated_at: "2025-06-28T11:15:00.000Z",
  },
]

/**
 * clubId 소속 대회 중 tournamentId를 조회한다. 없으면 그 클럽의 첫 대회로
 * 폴백해, 다른 클럽 소속 대회가 잘못 노출되는 것을 방지한다(실제 조회는
 * Task 006 이후 `.eq("club_id", ...).eq("id", ...)` + notFound()로 대체 예정).
 */
export function findTournamentById(clubId: string, tournamentId: string): Tournament {
  const clubTournaments = dummyTournaments.filter(
    (tournament) => tournament.club_id === clubId,
  )
  return (
    clubTournaments.find((tournament) => tournament.id === tournamentId) ??
    clubTournaments[0] ??
    dummyTournaments[0]
  )
}
