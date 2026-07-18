"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { removeMember, updateMemberRole } from "@/lib/actions/clubs";
import type { ClubRole } from "@/lib/types/domain";

interface MemberActionsProps {
  clubId: string;
  memberId: string;
  /** owner는 이 컴포넌트를 렌더링하는 쪽에서 이미 제외하지만, 방어적으로 다시 확인한다 */
  role: ClubRole;
}

/**
 * 관리자/운영자 전용 멤버 관리 UI(역할 변경 select + 제거 버튼).
 * owner 행은 이 컴포넌트를 아예 렌더링하지 않는 것이 호출부(members/page.tsx)의 책임이다
 * (owner 강등/승격 경로를 UI 어디에도 만들지 않기 위함).
 */
export function MemberActions({ clubId, memberId, role }: MemberActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [currentRole, setCurrentRole] = useState<Extract<ClubRole, "member" | "admin">>(
    role === "admin" ? "admin" : "member",
  );

  if (role === "owner") {
    return null;
  }

  const handleRoleChange = (value: string) => {
    const nextRole = value as "member" | "admin";
    const previousRole = currentRole;
    setCurrentRole(nextRole);

    startTransition(async () => {
      try {
        await updateMemberRole(clubId, memberId, nextRole);
        toast.success("역할이 변경되었습니다.");
      } catch (error) {
        setCurrentRole(previousRole);
        toast.error(
          error instanceof Error ? error.message : "역할 변경 중 오류가 발생했습니다.",
        );
      }
    });
  };

  const handleRemove = () => {
    if (!window.confirm("정말 이 멤버를 클럽에서 제거하시겠습니까?")) {
      return;
    }

    startTransition(async () => {
      try {
        await removeMember(clubId, memberId);
        toast.success("멤버를 제거했습니다.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "멤버 제거 중 오류가 발생했습니다.",
        );
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={currentRole} onValueChange={handleRoleChange} disabled={isPending}>
        <SelectTrigger size="sm" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">멤버</SelectItem>
          <SelectItem value="admin">관리자</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleRemove}
      >
        제거
      </Button>
    </div>
  );
}
