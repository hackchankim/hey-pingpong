"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { registerParticipant, withdrawParticipant } from "@/lib/actions/tournaments"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ParticipantStatus } from "@/lib/types/domain"

interface TournamentRegistrationActionProps {
  tournamentId: string
  /** 대회가 현재 참가 신청을 받고 있는지(status === 'registration_open') */
  registrationOpen: boolean
  /** 로그인한 사용자의 참가 신청 상태. 신청 이력이 없으면 null */
  currentStatus: ParticipantStatus | null
}

/** 클럽 멤버용 참가 신청 액션 아일랜드. 신청 여부/상태에 따라 버튼 또는 상태 배지를 보여준다. */
export function TournamentRegistrationAction({
  tournamentId,
  registrationOpen,
  currentStatus,
}: TournamentRegistrationActionProps) {
  const [isPending, startTransition] = useTransition()

  const handleRegister = () => {
    startTransition(async () => {
      try {
        await registerParticipant({ tournament_id: tournamentId })
        toast.success("참가 신청이 접수되었습니다. 관리자 승인을 기다려주세요.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "참가 신청에 실패했습니다.")
      }
    })
  }

  const handleWithdraw = () => {
    if (
      !window.confirm(
        "정말 참가 신청을 취소하시겠습니까?\n\n대회가 이미 진행 중이라면 대진표에는 자동으로 반영되지 않습니다 — 진행 중인 경기가 있다면 관리자에게 알려 부전승 처리를 요청해주세요.",
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        await withdrawParticipant({ tournament_id: tournamentId })
        toast.success("참가 신청을 취소했습니다.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "참가 신청 취소에 실패했습니다.")
      }
    })
  }

  if (currentStatus === "pending") {
    return (
      <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
        승인 대기중
      </Badge>
    )
  }

  if (currentStatus === "registered") {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          참가 확정
        </Badge>
        <Button type="button" variant="outline" size="sm" onClick={handleWithdraw} disabled={isPending}>
          {isPending ? "처리 중..." : "기권하기"}
        </Button>
      </div>
    )
  }

  if (currentStatus === "checked_in") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      >
        참가 확정
      </Badge>
    )
  }

  if (!registrationOpen) {
    return null
  }

  return (
    <Button type="button" onClick={handleRegister} disabled={isPending} className="w-fit">
      {isPending ? "신청 중..." : "참가 신청"}
    </Button>
  )
}
