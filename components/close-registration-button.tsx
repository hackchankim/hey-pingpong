"use client"

import { useTransition } from "react"
import { LockIcon } from "lucide-react"
import { toast } from "sonner"

import { closeRegistration } from "@/lib/actions/tournaments"
import { Button } from "@/components/ui/button"

interface CloseRegistrationButtonProps {
  tournamentId: string
}

/** 클럽 관리자용 "등록 마감" 버튼. registration_deadline을 현재 시각으로 즉시 앞당긴다. */
export function CloseRegistrationButton({ tournamentId }: CloseRegistrationButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      try {
        await closeRegistration(tournamentId)
        toast.success("참가 신청을 마감했습니다.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "마감 처리에 실패했습니다.")
      }
    })
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={isPending} className="w-fit">
      <LockIcon className="size-4" />
      {isPending ? "처리 중..." : "등록 마감"}
    </Button>
  )
}
