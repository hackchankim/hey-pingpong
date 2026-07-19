"use client"

import { useTransition } from "react"
import { XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { cancelTournament } from "@/lib/actions/tournaments"
import { Button } from "@/components/ui/button"

interface CancelTournamentButtonProps {
  tournamentId: string
}

/**
 * 클럽 관리자용 "대회 취소" 버튼. 되돌릴 수 없는 파괴적 액션이므로
 * (components/member-actions.tsx의 제거 버튼과 동일하게) 네이티브 confirm()으로
 * 한 번 더 확인받은 뒤에만 cancelTournament를 호출한다. 호출부(페이지)가 대회 상태를
 * 이미 확인해 completed/cancelled면 이 컴포넌트 자체를 렌더링하지 않는다.
 */
export function CancelTournamentButton({ tournamentId }: CancelTournamentButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    if (!window.confirm("정말 이 대회를 취소하시겠습니까? 취소 후에는 되돌릴 수 없습니다.")) {
      return
    }

    startTransition(async () => {
      try {
        await cancelTournament(tournamentId)
        toast.success("대회를 취소했습니다.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "대회 취소에 실패했습니다.")
      }
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-fit text-destructive hover:text-destructive"
      onClick={handleClick}
      disabled={isPending}
    >
      <XCircleIcon className="size-4" />
      {isPending ? "처리 중..." : "대회 취소"}
    </Button>
  )
}
