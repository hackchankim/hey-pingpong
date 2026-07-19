"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { updateParticipantStatus } from "@/lib/actions/tournaments"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface AdminParticipant {
  id: string
  name: string
  /** pending=승인 대기, registered=이미 승인됨(실격만 가능) */
  status: "pending" | "registered"
}

interface ParticipantAdminPanelProps {
  tournamentId: string
  participants: AdminParticipant[]
}

/**
 * 클럽 관리자용 참가자 관리 목록. 상태에 따라 버튼이 달라진다:
 * - pending(승인 대기): 승인/실격 버튼 모두 노출.
 * - registered(이미 승인됨): 실격 버튼만 노출(승인된 참가자도 대회 중 실격 처리 가능해야 함).
 */
export function ParticipantAdminPanel({
  tournamentId,
  participants,
}: ParticipantAdminPanelProps) {
  if (participants.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-col divide-y">
      {participants.map((participant) => (
        <ParticipantAdminRow
          key={participant.id}
          tournamentId={tournamentId}
          participant={participant}
        />
      ))}
    </ul>
  )
}

function ParticipantAdminRow({
  tournamentId,
  participant,
}: {
  tournamentId: string
  participant: AdminParticipant
}) {
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (status: "registered" | "disqualified") => {
    if (
      status === "disqualified" &&
      !window.confirm(
        "정말 이 참가자를 실격 처리하시겠습니까?\n\n대진표에 이미 배정된 진행 중인 경기가 있다면 자동으로 반영되지 않습니다 — 점수 입력 화면에서 상대방을 부전승으로 직접 처리해주세요.",
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        await updateParticipantStatus({
          tournament_id: tournamentId,
          participant_id: participant.id,
          status,
        })
        toast.success(status === "registered" ? "참가자를 승인했습니다." : "참가자를 실격 처리했습니다.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "처리에 실패했습니다.")
      }
    })
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{participant.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{participant.name}</span>
        {participant.status === "registered" && (
          <Badge
            variant="outline"
            className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          >
            승인됨
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => handleUpdate("disqualified")}
        >
          실격
        </Button>
        {participant.status === "pending" && (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => handleUpdate("registered")}
          >
            승인
          </Button>
        )}
      </div>
    </li>
  )
}
