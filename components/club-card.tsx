import { Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Club } from "@/lib/types/domain"

interface ClubCardProps {
  /** 표시할 클럽 정보 */
  club: Club
  /** 클럽 멤버 수 (선택) — 실제 집계는 데이터 연동 단계(Task 005~008)에서 처리 */
  memberCount?: number
  className?: string
}

/** 요금제(plan) 값을 한글 배지 라벨로 변환 */
function getPlanLabel(plan: string) {
  switch (plan) {
    case "pro":
      return "프로"
    case "free":
    default:
      return "무료"
  }
}

/** 클럽 목록에서 클럽 하나를 요약해 보여주는 카드 */
export function ClubCard({ club, memberCount, className }: ClubCardProps) {
  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <Avatar size="lg">
          <AvatarImage src={club.logo_url ?? undefined} alt={club.name} />
          <AvatarFallback>{club.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate text-base">{club.name}</CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {getPlanLabel(club.plan)}
            </Badge>
          </div>
          <CardDescription className="line-clamp-2">
            {club.description ?? "클럽 소개가 아직 없습니다."}
          </CardDescription>
        </div>
      </CardHeader>
      {typeof memberCount === "number" && (
        <CardContent className="flex items-center gap-1.5 pt-0 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          <span>멤버 {memberCount}명</span>
        </CardContent>
      )}
    </Card>
  )
}
