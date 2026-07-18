"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { updateParticipantStatus } from "@/lib/actions/tournaments"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

export interface PendingParticipant {
  id: string
  name: string
}

interface ParticipantAdminPanelProps {
  tournamentId: string
  participants: PendingParticipant[]
}

/** 클럽 관리자용: 승인 대기(pending) 참가자 목록에 승인/실격 버튼을 붙여 보여준다. */
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
  participant: PendingParticipant
}) {
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (status: "registered" | "disqualified") => {
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
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => handleUpdate("registered")}
        >
          승인
        </Button>
      </div>
    </li>
  )
}
