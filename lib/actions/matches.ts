"use server"

// 경기(matches) / 세트 점수(match_games) 관련 Server Action 모음.
// ROADMAP Phase 3 Task 007. 대진표 형태 계산은 lib/tournament/bracket.ts의 순수 함수가
// 담당하고, 여기서는 그 결과를 create_tournament_matches RPC로 저장하거나
// record_match_result RPC로 경기 결과를 기록하는 얇은 래퍼만 둔다(shrimp-rules.md 원칙 —
// 대진표 형태 계산은 애플리케이션 코드, 다중 테이블 원자적 쓰기는 RPC로 역할 분리).
//
// 모든 함수는 매번 `await createClient()`로 새 Supabase 서버 클라이언트를 생성하고
// (Fluid compute 요구사항, 전역 변수 저장 금지), 실패 시 원본 에러는 console.error로
// 로깅한 뒤 사용자에게 노출 가능한 메시지로 감싸서 throw한다.

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  generateRoundRobinBracket,
  generateSingleEliminationBracket,
} from "@/lib/tournament/bracket"
import type {
  RecordMatchResultInput,
  RecordMatchResultResult,
} from "@/lib/types/actions"
import type { Json } from "@/lib/types/database.types"

const createTournamentMatchesSchema = z.string().uuid()

/**
 * 대회 참가자(status='registered')를 신청 순서(created_at)로 조회해 대진표를 계산하고,
 * create_tournament_matches RPC로 원자적으로 저장한다.
 * rating_at_registration은 이번 스코프(Task007)에서 항상 null이라 시드 정렬 기준으로
 * 쓸 수 없으므로, 참가 신청 순서를 그대로 시드 순서로 사용한다.
 */
export async function createTournamentMatches(tournamentId: string): Promise<void> {
  const parsed = createTournamentMatchesSchema.safeParse(tournamentId)
  if (!parsed.success) {
    console.error("createTournamentMatches 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", parsed.data)
    .single()

  if (tournamentError || !tournament) {
    console.error("createTournamentMatches: 대회 조회 실패:", tournamentError)
    throw new Error("대회를 찾을 수 없습니다.")
  }

  const { data: participants, error: participantsError } = await supabase
    .from("tournament_participants")
    .select("user_id")
    .eq("tournament_id", tournament.id)
    .eq("status", "registered")
    .order("created_at", { ascending: true })

  if (participantsError) {
    console.error("createTournamentMatches: 참가자 조회 실패:", participantsError)
    throw new Error("참가자 목록을 불러오지 못했습니다.")
  }

  const participantIds = (participants ?? []).map((p) => p.user_id)

  if (participantIds.length < 2) {
    throw new Error("대진표를 생성하려면 승인된 참가자가 2명 이상 필요합니다.")
  }

  if (tournament.format === "double_elimination") {
    // 더블 엘리미네이션 대진표 생성은 이번 스코프(Task007) 밖이다.
    throw new Error("더블 엘리미네이션 대진표 생성은 아직 지원하지 않습니다.")
  }

  const matches =
    tournament.format === "round_robin"
      ? generateRoundRobinBracket(participantIds)
      : generateSingleEliminationBracket(participantIds)

  const { error } = await supabase.rpc("create_tournament_matches", {
    p_tournament_id: tournament.id,
    // BracketMatchInput[]과 Json은 구조적으로 완전히 호환되지 않으므로(옵셔널 필드가
    // undefined를 포함) 여기서만 명시적으로 캐스팅한다.
    p_matches: matches as unknown as Json,
  })

  if (error) {
    console.error("createTournamentMatches: create_tournament_matches RPC 실패:", error)
    throw new Error("대진표 생성에 실패했습니다. 클럽 관리자 권한을 확인해주세요.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]/bracket", "page")
}

const matchGameScoreSchema = z.object({
  game_number: z.number().int().positive(),
  player1_score: z.number().int().min(0),
  player2_score: z.number().int().min(0),
})

const recordMatchResultSchema = z.object({
  match_id: z.string().uuid(),
  games: z.array(matchGameScoreSchema),
  walkover_winner_id: z.string().uuid().nullish(),
})

/**
 * 경기 결과 기록. 세트별 점수 입력 또는 부전승 처리를 record_match_result RPC 하나로
 * 원자적으로 처리한다(경기 상태 갱신 + 다음 라운드 진출 배정 + 대회 완료 판정이 한
 * 트랜잭션 안에서 일관되어야 하므로 여러 테이블에 걸친 쓰기를 애플리케이션 코드로
 * 분산 구현하지 않는다 — shrimp-rules.md 원칙).
 */
export async function recordMatchResult(
  input: RecordMatchResultInput,
): Promise<RecordMatchResultResult> {
  const parsed = recordMatchResultSchema.safeParse(input)
  if (!parsed.success) {
    console.error("recordMatchResult 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc("record_match_result", {
    p_match_id: parsed.data.match_id,
    p_games: parsed.data.games as unknown as Json,
    p_walkover_winner_id: parsed.data.walkover_winner_id ?? undefined,
  })

  if (error || !data) {
    console.error("recordMatchResult: record_match_result RPC 실패:", error)
    throw new Error("경기 결과 기록에 실패했습니다. 클럽 관리자 권한을 확인해주세요.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]/bracket", "page")

  return data as unknown as RecordMatchResultResult
}
