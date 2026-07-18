// 대진표 형태 계산(circle method 풀리그, 싱글 엘리미네이션 시딩/부전승 배치)을 담당하는
// 순수 TypeScript 함수 모음. Supabase/DB 접근이나 다른 부수효과를 절대 포함하지 않는다
// (shrimp-rules.md "대진표/랭킹 로직 배치 규칙" — 대진표 형태 계산은 이 파일의 순수 함수로만,
// Postgres 함수로 구현 금지). 결과는 `create_tournament_matches` RPC로 그대로 전달되어
// 하나의 트랜잭션으로 확정 저장된다.

import type { BracketMatchInput } from "@/lib/types/actions"

/**
 * 풀리그(round robin) 대진표를 표준 circle method로 생성한다.
 *
 * - 참가자 수가 홀수면 배열 끝에 부전승(null)을 추가해 짝수로 맞춘다.
 * - arr[0]은 고정하고 나머지를 라운드마다 한 칸씩 회전시키며, 매 라운드
 *   (arr[0], arr[m-1]), (arr[1], arr[m-2]), ... 순서로 m/2쌍을 만든다.
 * - 둘 다 실제 참가자인 쌍만 매치로 만들고(부전승 쌍은 매치 row 자체를 생성하지 않음),
 *   총 m-1 라운드를 반복한다.
 */
export function generateRoundRobinBracket(participantIds: string[]): BracketMatchInput[] {
  if (participantIds.length < 2) {
    return []
  }

  const isOdd = participantIds.length % 2 !== 0
  let arr: (string | null)[] = isOdd
    ? [...participantIds, null]
    : [...participantIds]

  const m = arr.length
  const totalRounds = m - 1
  const result: BracketMatchInput[] = []

  for (let round = 1; round <= totalRounds; round++) {
    let matchNumber = 1

    for (let i = 0; i < m / 2; i++) {
      const player1 = arr[i]
      const player2 = arr[m - 1 - i]

      if (player1 !== null && player2 !== null) {
        result.push({
          bracket: "main",
          round,
          match_number: matchNumber++,
          player1_id: player1,
          player2_id: player2,
          match_ref: crypto.randomUUID(),
        })
      }
    }

    // 회전: arr[0]은 고정, arr[1..m-1]을 한 칸씩 뒤로 미는 표준 circle method 회전.
    const fixed = arr[0]
    const rest = arr.slice(1)
    const last = rest.pop() ?? null
    rest.unshift(last)
    arr = [fixed, ...rest]
  }

  return result
}

/** 다음 라운드로 진출할 자리 하나를 표현: 부전승으로 직행한 참가자, 또는 이전 라운드 매치 승자 대기 */
type AdvancementSlot =
  | { type: "player"; id: string }
  | { type: "match"; ref: string }

/**
 * 싱글 엘리미네이션 대진표를 생성한다. 입력은 이미 시드 순으로 정렬됐다고 가정하며
 * 재정렬하지 않는다.
 *
 * - bracketSize = 2^ceil(log2(n)), byeCount = bracketSize - n.
 * - 라운드1: 시드[byeCount..n-1]을 순서대로 2명씩 묶어 실제 매치를 만들고,
 *   시드[0..byeCount-1]은 매치 없이 라운드2 직행 슬롯으로 보관한다.
 * - 라운드2 이후: 이전 라운드에서 만들어진 슬롯들(직행 참가자 + 매치 승자 대기)을
 *   순서대로 2개씩 묶어 다음 라운드 매치를 만든다 — 슬롯이 직행 참가자면 player_id를
 *   즉시 채우고, 슬롯이 이전 매치면 해당 player_source_match_ref로 연결해 나중에
 *   record_match_result RPC가 승자를 채우도록 비워둔다.
 * - 매치가 1개(결승)로 줄어들 때까지 반복한다. 표준 시딩 테이블(1번-2번 시드가 결승에서만
 *   만나는 정교한 배치)은 다루지 않는다(과설계 금지, 단순 순차 배치로 충분).
 */
export function generateSingleEliminationBracket(
  participantIds: string[],
): BracketMatchInput[] {
  const n = participantIds.length
  if (n < 2) {
    return []
  }

  const bracketSize = 2 ** Math.ceil(Math.log2(n))
  const byeCount = bracketSize - n

  const result: BracketMatchInput[] = []
  let round = 1
  let matchNumber = 1

  // 라운드1: 부전승 직행 참가자를 슬롯에 먼저 채운다.
  let currentSlots: AdvancementSlot[] = []
  for (let i = 0; i < byeCount; i++) {
    currentSlots.push({ type: "player", id: participantIds[i] })
  }

  // 나머지 참가자를 2명씩 묶어 라운드1 실제 매치를 만든다.
  for (let i = byeCount; i < n; i += 2) {
    const matchRef = crypto.randomUUID()
    result.push({
      bracket: "main",
      round,
      match_number: matchNumber++,
      player1_id: participantIds[i],
      player2_id: participantIds[i + 1],
      match_ref: matchRef,
    })
    currentSlots.push({ type: "match", ref: matchRef })
  }

  round += 1

  while (currentSlots.length > 1) {
    const nextSlots: AdvancementSlot[] = []
    matchNumber = 1

    for (let i = 0; i < currentSlots.length; i += 2) {
      const slotA = currentSlots[i]
      const slotB = currentSlots[i + 1]
      const matchRef = crypto.randomUUID()

      const match: BracketMatchInput = {
        bracket: "main",
        round,
        match_number: matchNumber++,
        match_ref: matchRef,
      }

      if (slotA.type === "player") {
        match.player1_id = slotA.id
      } else {
        match.player1_source_match_ref = slotA.ref
      }

      if (slotB.type === "player") {
        match.player2_id = slotB.id
      } else {
        match.player2_source_match_ref = slotB.ref
      }

      result.push(match)
      nextSlots.push({ type: "match", ref: matchRef })
    }

    currentSlots = nextSlots
    round += 1
  }

  return result
}
