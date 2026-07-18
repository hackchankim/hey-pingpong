import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ParticipantStatus, TournamentParticipant } from "@/lib/types/domain"

interface ParticipantListProps {
  /** 표시할 대회 참가자 목록 */
  participants: TournamentParticipant[]
  /** user_id -> 표시용 이름 매핑 */
  userNames: Record<string, string>
  className?: string
}

/** 참가자 상태(status)를 한글 라벨 + 배지 스타일로 변환 */
const STATUS_META: Record<ParticipantStatus, { label: string; className: string }> = {
  pending: {
    label: "신청",
    className: "border-transparent bg-muted text-muted-foreground",
  },
  registered: {
    label: "승인",
    className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  checked_in: {
    label: "체크인 완료",
    className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  withdrawn: {
    label: "취소",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  disqualified: {
    label: "실격",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
}

/** 대회 참가 신청자 목록을 상태 배지와 함께 표시하는 컴포넌트 */
export function ParticipantList({
  participants,
  userNames,
  className,
}: ParticipantListProps) {
  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">아직 신청한 참가자가 없습니다.</p>
    )
  }

  return (
    <ul className={cn("flex flex-col divide-y", className)}>
      {participants.map((participant) => {
        const statusMeta = STATUS_META[participant.status]
        const name = userNames[participant.user_id] ?? "알 수 없음"

        return (
          <li
            key={participant.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {participant.seed ? `시드 ${participant.seed}` : "시드 없음"}
                  {typeof participant.rating_at_registration === "number" &&
                    ` · 레이팅 ${participant.rating_at_registration}`}
                </span>
              </div>
            </div>
            <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
          </li>
        )
      })}
    </ul>
  )
}
