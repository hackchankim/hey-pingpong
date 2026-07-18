"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { createTournamentMatches } from "@/lib/actions/matches"
import { Button } from "@/components/ui/button"

interface CreateBracketButtonProps {
  tournamentId: string
  disabled?: boolean
}

/** 관리자 전용 "대진표 생성" 버튼. 참가자 확정 순서를 기준으로 대진표를 계산해 저장한다. */
export function CreateBracketButton({ tournamentId, disabled }: CreateBracketButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      try {
        await createTournamentMatches(tournamentId)
        toast.success("대진표를 생성했습니다.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "대진표 생성에 실패했습니다.")
      }
    })
  }

  return (
    <Button type="button" disabled={disabled || isPending} onClick={handleClick}>
      {isPending ? "생성 중..." : "대진표 생성"}
    </Button>
  )
}
