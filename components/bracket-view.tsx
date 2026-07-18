import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Match, MatchStatus } from "@/lib/types/domain"

interface BracketViewProps {
  /** 표시할 경기 목록 — round 기준으로 그룹핑해 라운드별 카드로 나열한다 */
  matches: Match[]
  /** player1_id/player2_id/winner_id -> 표시용 이름 매핑 */
  userNames: Record<string, string>
  className?: string
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
 * 대회 대진표를 라운드별로 그룹핑해 카드 목록으로 표시하는 컴포넌트.
 * 트리 연결선 등 고급 시각화는 다루지 않으며, 이미 계산된 Match[]를 보여주기만 한다.
 */
export function BracketView({ matches, userNames, className }: BracketViewProps) {
  const roundNumbers = Array.from(new Set(matches.map((match) => match.round))).sort(
    (a, b) => a - b,
  )

  if (roundNumbers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">표시할 대진 정보가 없습니다.</p>
    )
  }

  return (
    <div className={cn("flex gap-4 overflow-x-auto pb-2", className)}>
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
