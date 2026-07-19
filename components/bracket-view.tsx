import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Match, MatchBracket, MatchStatus } from "@/lib/types/domain"

interface BracketViewProps {
  /** 표시할 경기 목록 — bracket(main/winners/losers)으로 먼저 그룹핑한 뒤 round로 나열한다 */
  matches: Match[]
  /** player1_id/player2_id/winner_id -> 표시용 이름 매핑 */
  userNames: Record<string, string>
  className?: string
}

/** bracket 표시 순서 + 한국어 섹션 라벨(더블 엘리미네이션에서만 여러 섹션이 나타난다) */
const BRACKET_ORDER: MatchBracket[] = ["winners", "losers", "main"]
const BRACKET_LABELS: Record<MatchBracket, string> = {
  winners: "승자조",
  losers: "패자조",
  main: "결승",
}

/** 경기 상태(status)를 한글 라벨 + 배지 스타일로 변환 */
const STATUS_META: Record<MatchStatus, { label: string; className: string }> = {
  pending: {
    label: "대기",
    className: "border-transparent bg-muted text-muted-foreground",
  },
  ready: {
    label: "진행 가능",
    className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  in_progress: {
    label: "진행중",
    className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  completed: {
    label: "완료",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  walkover: {
    label: "부전승",
    className: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
}

function getPlayerName(
  playerId: string | null,
  userNames: Record<string, string>,
) {
  if (!playerId) return "미정"
  return userNames[playerId] ?? "알 수 없음"
}

/**
 * 대회 대진표를 라운드별로 그룹핑해 카드 목록으로 표시하는 컴포넌트(bracket 한 그룹 내부).
 * 트리 연결선 등 고급 시각화는 다루지 않으며, 이미 계산된 Match[]를 보여주기만 한다.
 */
function RoundColumns({
  matches,
  userNames,
}: {
  matches: Match[]
  userNames: Record<string, string>
}) {
  const roundNumbers = Array.from(new Set(matches.map((match) => match.round))).sort(
    (a, b) => a - b,
  )

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {roundNumbers.map((round) => {
        const roundMatches = matches
          .filter((match) => match.round === round)
          .sort((a, b) => a.match_number - b.match_number)

        return (
          <div key={round} className="flex w-64 shrink-0 flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {round}라운드
            </h3>
            {roundMatches.map((match) => {
              const statusMeta = STATUS_META[match.status]
              const player1Name = getPlayerName(match.player1_id, userNames)
              const player2Name = getPlayerName(match.player2_id, userNames)

              return (
                <Card key={match.id}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {match.court_label ?? `경기 ${match.match_number}`}
                      </span>
                      <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <div
                        className={cn(
                          "flex items-center justify-between rounded px-2 py-1",
                          match.winner_id === match.player1_id &&
                            match.player1_id &&
                            "bg-accent font-semibold",
                        )}
                      >
                        <span>{player1Name}</span>
                        <span className="tabular-nums">{match.player1_games_won}</span>
                      </div>
                      <div
                        className={cn(
                          "flex items-center justify-between rounded px-2 py-1",
                          match.winner_id === match.player2_id &&
                            match.player2_id &&
                            "bg-accent font-semibold",
                        )}
                      >
                        <span>{player2Name}</span>
                        <span className="tabular-nums">{match.player2_games_won}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 대회 대진표를 bracket(main/winners/losers)으로 먼저 그룹핑한 뒤, 각 그룹 안에서
 * 라운드별 카드 목록(RoundColumns)을 보여주는 컴포넌트.
 *
 * 라운드로빈/싱글엘리미네이션은 모든 경기가 bracket='main' 하나뿐이므로 이 경우
 * 섹션 제목 없이 기존과 동일하게(단순 라운드 나열) 보여준다 — 더블 엘리미네이션처럼
 * bracket이 2개 이상 섞여 있을 때만 "승자조"/"패자조"/"결승" 섹션 제목을 붙인다.
 */
export function BracketView({ matches, userNames, className }: BracketViewProps) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">표시할 대진 정보가 없습니다.</p>
    )
  }

  const presentBrackets = BRACKET_ORDER.filter((bracket) =>
    matches.some((match) => match.bracket === bracket),
  )
  const showBracketSections = presentBrackets.length > 1

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {presentBrackets.map((bracket) => {
        const bracketMatches = matches.filter((match) => match.bracket === bracket)

        return (
          <div key={bracket} className="flex flex-col gap-3">
            {showBracketSections && (
              <h2 className="text-base font-semibold">{BRACKET_LABELS[bracket]}</h2>
            )}
            <RoundColumns matches={bracketMatches} userNames={userNames} />
          </div>
        )
      })}
    </div>
  )
}
