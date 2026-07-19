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
 * 엘리미네이션 트리(부전승 배치 + 라운드별 시딩) 계산 본체. `generateSingleEliminationBracket`과
 * `generateDoubleEliminationBracket`의 승자조(winners) 생성 로직이 완전히 동일하므로
 * 공용 헬퍼로 추출했다 — 알고리즘 자체는 원래 `generateSingleEliminationBracket`에 있던
 * 것과 한 글자도 다르지 않다(호출부에서 bracket 라벨만 주입).
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
 *
 * 반환값의 `roundMatches`는 라운드 인덱스(0-based, roundMatches[0]이 1라운드) 순서로
 * 그 라운드에 실제 생성된 매치 목록을 담는다 — 더블 엘리미네이션에서 패자조 큐를
 * 라운드 진행 순서대로 채우기 위해 필요하다(생성된 매치가 없는 라운드는 없다: n>=2이면
 * 라운드1은 항상 최소 1개의 실제 매치를 만든다).
 */
function buildEliminationBracket(
  participantIds: string[],
  bracketLabel: "main" | "winners",
): { matches: BracketMatchInput[]; roundMatches: BracketMatchInput[][] } {
  const n = participantIds.length
  if (n < 2) {
    return { matches: [], roundMatches: [] }
  }

  const bracketSize = 2 ** Math.ceil(Math.log2(n))
  const byeCount = bracketSize - n

  const result: BracketMatchInput[] = []
  const roundMatches: BracketMatchInput[][] = []
  let round = 1
  let matchNumber = 1

  // 라운드1: 부전승 직행 참가자를 슬롯에 먼저 채운다.
  let currentSlots: AdvancementSlot[] = []
  for (let i = 0; i < byeCount; i++) {
    currentSlots.push({ type: "player", id: participantIds[i] })
  }

  // 나머지 참가자를 2명씩 묶어 라운드1 실제 매치를 만든다.
  const round1Matches: BracketMatchInput[] = []
  for (let i = byeCount; i < n; i += 2) {
    const matchRef = crypto.randomUUID()
    const match: BracketMatchInput = {
      bracket: bracketLabel,
      round,
      match_number: matchNumber++,
      player1_id: participantIds[i],
      player2_id: participantIds[i + 1],
      match_ref: matchRef,
    }
    result.push(match)
    round1Matches.push(match)
    currentSlots.push({ type: "match", ref: matchRef })
  }
  roundMatches.push(round1Matches)

  round += 1

  while (currentSlots.length > 1) {
    const nextSlots: AdvancementSlot[] = []
    const thisRoundMatches: BracketMatchInput[] = []
    matchNumber = 1

    for (let i = 0; i < currentSlots.length; i += 2) {
      const slotA = currentSlots[i]
      const slotB = currentSlots[i + 1]
      const matchRef = crypto.randomUUID()

      const match: BracketMatchInput = {
        bracket: bracketLabel,
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
      thisRoundMatches.push(match)
      nextSlots.push({ type: "match", ref: matchRef })
    }

    roundMatches.push(thisRoundMatches)
    currentSlots = nextSlots
    round += 1
  }

  return { matches: result, roundMatches }
}

/**
 * 싱글 엘리미네이션 대진표를 생성한다. 입력은 이미 시드 순으로 정렬됐다고 가정하며
 * 재정렬하지 않는다. 실제 트리 계산은 `buildEliminationBracket`(bracket='main')에 위임한다.
 */
export function generateSingleEliminationBracket(
  participantIds: string[],
): BracketMatchInput[] {
  return buildEliminationBracket(participantIds, "main").matches
}

/**
 * 더블 엘리미네이션 대진표를 생성한다. 표준 패자조 시딩(재대결 방지 최적 배치)이나
 * 그랜드파이널 재경기(bracket reset)는 구현하지 않는다 — 단일 그랜드파이널로 확정.
 *
 * 1단계: `buildEliminationBracket`로 승자조(winners)를 통째로 생성한다. 라운드별 실제
 *   매치 목록(`roundMatches`)을 패자조 큐를 채우는 데 그대로 재사용한다.
 * 2단계: 큐 기반으로 패자조(losers)를 생성한다 — 승자조 각 라운드가 끝날 때마다 그
 *   라운드의 패자들을 큐에 넣고, 큐에 2개 이상 쌓이면 즉시 짝을 지어 패자조 매치를 만든다
 *   (매치 승자는 다시 큐로 돌아가 다음 패자와 짝지어질 수 있다).
 * 3단계: 승자조 챔피언(항상 마지막 라운드의 유일한 실제 매치의 승자)과 패자조에서
 *   마지막까지 살아남은 큐 항목으로 그랜드파이널 1경기를 만든다. 참가자가 아주 적어
 *   패자조 매치가 한 번도 생성되지 않은 경우(n=2), 큐에 남는 항목은 승자조 결승에서
 *   "패배한 선수 그 자체"(loser_of)이므로 `player2_loser_source_match_ref`로 연결해야
 *   한다 — 이를 놓치면 그랜드파이널이 잘못된 참조로 생성된다.
 */
export function generateDoubleEliminationBracket(
  participantIds: string[],
): BracketMatchInput[] {
  const n = participantIds.length
  if (n < 2) {
    return []
  }

  const { matches: winnersMatches, roundMatches: wbRoundMatches } = buildEliminationBracket(
    participantIds,
    "winners",
  )

  type QueueItem = { kind: "winner_of" | "loser_of"; matchRef: string }

  /** 패자조 매치의 한 슬롯을 채운다: 상대가 어느 매치의 승자인지/패자인지에 따라 알맞은 참조 필드를 고른다. */
  function slotFor(
    slot: "player1" | "player2",
    item: QueueItem,
  ): Partial<BracketMatchInput> {
    if (item.kind === "winner_of") {
      return slot === "player1"
        ? { player1_source_match_ref: item.matchRef }
        : { player2_source_match_ref: item.matchRef }
    }
    return slot === "player1"
      ? { player1_loser_source_match_ref: item.matchRef }
      : { player2_loser_source_match_ref: item.matchRef }
  }

  const lbQueue: QueueItem[] = []
  const lbMatches: BracketMatchInput[] = []
  let lbRound = 1

  for (const roundMatches of wbRoundMatches) {
    for (const m of roundMatches) {
      lbQueue.push({ kind: "loser_of", matchRef: m.match_ref })
    }

    while (lbQueue.length >= 2) {
      const a = lbQueue.shift()!
      const b = lbQueue.shift()!
      const ref = crypto.randomUUID()
      const matchNumberInRound =
        lbMatches.filter((x) => x.round === lbRound).length + 1

      lbMatches.push({
        bracket: "losers",
        round: lbRound,
        match_number: matchNumberInRound,
        match_ref: ref,
        ...slotFor("player1", a),
        ...slotFor("player2", b),
      })

      lbQueue.push({ kind: "winner_of", matchRef: ref })
    }

    lbRound++
  }

  // 이 시점에 lbQueue.length는 항상 정확히 1이어야 한다(각 wbRound 끝마다 while로 큐를 소진하므로).
  // 승자조는 n>=2이면 항상 정확히 1개의 마지막 라운드 매치(결승)를 갖는다.
  const wbFinalMatch = wbRoundMatches[wbRoundMatches.length - 1][0]

  const grandFinal: BracketMatchInput = {
    bracket: "main",
    round: 1,
    match_number: 1,
    match_ref: crypto.randomUUID(),
    // 승자조 챔피언은 항상 실제 매치의 승자이므로 고정.
    player1_source_match_ref: wbFinalMatch.match_ref,
    // ⚠️ 반드시 slotFor 공용 로직 사용 — lbQueue[0]이 'loser_of' 타입일 수 있다(n=2 케이스).
    ...slotFor("player2", lbQueue[0]),
  }

  return [...winnersMatches, ...lbMatches, grandFinal]
}
