import { Calendar, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from "@/lib/types/domain"

interface TournamentCardProps {
  /** 표시할 대회 정보 */
  tournament: Tournament
  className?: string
}

/** 대회 진행 방식(format)을 한글 라벨로 변환 */
const FORMAT_LABELS: Record<TournamentFormat, string> = {
  round_robin: "풀리그",
  single_elimination: "싱글 토너먼트",
  double_elimination: "더블 엘리미네이션",
}

/** 대회 상태(status)를 한글 라벨 + 배지 스타일로 변환 */
const STATUS_META: Record<
  TournamentStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "준비중",
    className: "border-transparent bg-muted text-muted-foreground",
  },
  registration_open: {
    label: "모집중",
    className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  in_progress: {
    label: "진행중",
    className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  completed: {
    label: "종료",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  cancelled: {
    label: "취소됨",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
}

function formatDate(value: string | null) {
  if (!value) return "미정"
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/** 대회 목록에서 대회 하나를 요약해 보여주는 카드 */
export function TournamentCard({ tournament, className }: TournamentCardProps) {
  const statusMeta = STATUS_META[tournament.status]

  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{tournament.name}</CardTitle>
        <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Users className="size-4" aria-hidden="true" />
          <span>{FORMAT_LABELS[tournament.format]}</span>
          {typeof tournament.max_participants === "number" && (
            <span>· 최대 {tournament.max_participants}명</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="size-4" aria-hidden="true" />
          <span>{formatDate(tournament.starts_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
