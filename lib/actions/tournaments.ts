"use server"

// 대회(tournaments) / 대회 참가자(tournament_participants) 관련 Server Action 모음.
// ROADMAP Phase 3 Task 006. 대진표 생성(create_tournament_matches RPC)은 Task007 범위이므로
// 여기에는 포함하지 않는다.
//
// 모든 함수는 매번 `await createClient()`로 새 Supabase 서버 클라이언트를 생성하고
// (Fluid compute 요구사항, 전역 변수 저장 금지), 실패 시 원본 에러는 console.error로
// 로깅한 뒤 사용자에게 노출 가능한 메시지로 감싸서 throw한다.

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import type {
  CreateTournamentInput,
  CreateTournamentResult,
  RegisterParticipantInput,
  RegisterParticipantResult,
  UpdateParticipantStatusInput,
  WithdrawParticipantInput,
} from "@/lib/types/actions"
import type { Tournament } from "@/lib/types/domain"
import type { Json } from "@/lib/types/database.types"

const createTournamentSchema = z.object({
  club_id: z.string().uuid(),
  name: z.string().trim().min(1, "대회 이름을 입력해주세요.").max(100),
  format: z.enum(["round_robin", "single_elimination", "double_elimination"]),
  max_participants: z.number().int().positive().nullish(),
  registration_deadline: z.string().nullish(),
  starts_at: z.string().nullish(),
  ruleset: z.record(z.string(), z.unknown()).nullish(),
})

/**
 * 대회 생성. status는 항상 'registration_open'을 명시적으로 넣어(컬럼 기본값 'draft'와
 * 별개로) 생성 즉시 참가 신청을 받을 수 있는 상태로 시작한다.
 * RLS: tournaments_insert_admin(is_club_admin(club_id))이 강제하므로 관리자가 아니면
 * insert 자체가 거부된다.
 */
export async function createTournament(
  input: CreateTournamentInput,
): Promise<CreateTournamentResult> {
  const parsed = createTournamentSchema.safeParse(input)
  if (!parsed.success) {
    console.error("createTournament 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claimsData?.claims) {
    throw new Error("로그인이 필요합니다.")
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      club_id: parsed.data.club_id,
      name: parsed.data.name,
      format: parsed.data.format,
      max_participants: parsed.data.max_participants ?? null,
      registration_deadline: parsed.data.registration_deadline ?? null,
      starts_at: parsed.data.starts_at ?? null,
      // Record<string, unknown>과 생성 타입의 jsonb Json 타입은 구조적으로 완전히 호환되지
      // 않아(Json은 string/number 등 원시값도 포함) 여기서만 명시적으로 캐스팅한다.
      ruleset: (parsed.data.ruleset ?? null) as unknown as Json | null,
      status: "registration_open",
      created_by: claimsData.claims.sub,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("createTournament 실패:", error)
    throw new Error("대회를 생성하지 못했습니다. 클럽 관리자 권한을 확인해주세요.")
  }

  revalidatePath("/c/[clubSlug]/tournaments", "page")
  // 생성 타입(Row)의 ruleset: Json과 도메인 타입의 ruleset: Record<string, unknown> | null은
  // 값 자체는 항상 호환되지만(우리가 쓰는 값은 항상 객체거나 null) 구조적으로 다르므로 캐스팅한다.
  return { tournament: data as unknown as Tournament }
}

const registerParticipantSchema = z.object({
  tournament_id: z.string().uuid(),
})

/**
 * 대회 참가 신청. 대회 상태가 'registration_open'이 아니거나 신청 마감 시간이 지났으면
 * 사용자용 에러를 먼저 던진다. 통과하면 status: 'pending'으로 insert하고,
 * club_id는 참고용으로 함께 보내되 실제 값은 DB 트리거(set_tournament_participant_club_id)가
 * tournament_id 기준으로 재계산해 덮어쓴다.
 */
export async function registerParticipant(
  input: RegisterParticipantInput,
): Promise<RegisterParticipantResult> {
  const parsed = registerParticipantSchema.safeParse(input)
  if (!parsed.success) {
    console.error("registerParticipant 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claimsData?.claims) {
    throw new Error("로그인이 필요합니다.")
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, club_id, status, registration_deadline")
    .eq("id", parsed.data.tournament_id)
    .single()

  if (tournamentError || !tournament) {
    console.error("registerParticipant: 대회 조회 실패:", tournamentError)
    throw new Error("대회를 찾을 수 없습니다.")
  }

  if (tournament.status !== "registration_open") {
    throw new Error("현재 참가 신청을 받고 있지 않은 대회입니다.")
  }

  if (
    tournament.registration_deadline &&
    new Date(tournament.registration_deadline).getTime() < Date.now()
  ) {
    throw new Error("참가 신청 마감 시간이 지났습니다.")
  }

  const { data, error } = await supabase
    .from("tournament_participants")
    .insert({
      tournament_id: tournament.id,
      club_id: tournament.club_id,
      user_id: claimsData.claims.sub,
      status: "pending",
    })
    .select()
    .single()

  if (error || !data) {
    console.error("registerParticipant 실패:", error)
    throw new Error("참가 신청에 실패했습니다. 이미 신청했을 수 있습니다.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
  return { participant: data }
}

const updateParticipantStatusSchema = z.object({
  tournament_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  status: z.enum(["registered", "disqualified"]),
})

/**
 * 관리자 전용: 참가자 승인(pending → registered) 또는 실격 처리.
 * RLS(participants_update_admin)가 관리자 여부를 강제하므로, 여기서는 별도 권한 체크 없이
 * update 결과가 0건이면(RLS 거부 또는 존재하지 않는 행) 에러로 방어한다.
 */
export async function updateParticipantStatus(
  input: UpdateParticipantStatusInput,
): Promise<void> {
  const parsed = updateParticipantStatusSchema.safeParse(input)
  if (!parsed.success) {
    console.error("updateParticipantStatus 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tournament_participants")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.participant_id)
    .eq("tournament_id", parsed.data.tournament_id)
    .select("id")
    .single()

  if (error || !data) {
    console.error("updateParticipantStatus 실패:", error)
    throw new Error("참가자 상태를 변경하지 못했습니다. 관리자 권한을 확인해주세요.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
}

const withdrawParticipantSchema = z.object({
  tournament_id: z.string().uuid(),
})

/** 본인 전용: 자신의 참가 신청을 취소(withdrawn)한다. */
export async function withdrawParticipant(
  input: WithdrawParticipantInput,
): Promise<void> {
  const parsed = withdrawParticipantSchema.safeParse(input)
  if (!parsed.success) {
    console.error("withdrawParticipant 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claimsData?.claims) {
    throw new Error("로그인이 필요합니다.")
  }

  const { data, error } = await supabase
    .from("tournament_participants")
    .update({ status: "withdrawn" })
    .eq("tournament_id", parsed.data.tournament_id)
    .eq("user_id", claimsData.claims.sub)
    .select("id")
    .single()

  if (error || !data) {
    console.error("withdrawParticipant 실패:", error)
    throw new Error("참가 신청을 취소하지 못했습니다.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
}

const closeRegistrationSchema = z.string().uuid()

/** 관리자 전용: 참가 신청 마감 시간을 현재 시각으로 즉시 앞당긴다. */
export async function closeRegistration(tournamentId: string): Promise<void> {
  const parsed = closeRegistrationSchema.safeParse(tournamentId)
  if (!parsed.success) {
    console.error("closeRegistration 입력 검증 실패:", parsed.error.flatten())
    throw new Error("입력값을 확인해주세요.")
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tournaments")
    .update({ registration_deadline: new Date().toISOString() })
    .eq("id", parsed.data)
    .select("id")
    .single()

  if (error || !data) {
    console.error("closeRegistration 실패:", error)
    throw new Error("참가 신청 마감 처리에 실패했습니다. 관리자 권한을 확인해주세요.")
  }

  revalidatePath("/c/[clubSlug]/tournaments/[tournamentId]", "page")
}
