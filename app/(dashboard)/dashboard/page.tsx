import Link from "next/link";

import { ClubCard } from "@/components/club-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Club } from "@/lib/types/domain";

export default async function DashboardPage() {
  const supabase = await createClient();

  // 레이아웃(AuthGate)에서 이미 인증을 보장하지만, "내 클럽"을 필터링하려면
  // 현재 로그인 사용자의 id가 필요하므로 여기서도 claims를 확인한다.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  // club_members(내 활성 멤버십) -> clubs 중첩 조회. RLS(clubs_select_member,
  // club_members_select_member)가 각 행에 대해 다시 멤버십을 확인하므로 이중 안전하다.
  const { data: memberships } = userId
    ? await supabase
        .from("club_members")
        .select("club_id, joined_at, clubs(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: false })
    : { data: null };

  const myClubs = (memberships ?? [])
    .map((membership) => membership.clubs)
    .filter((club): club is Club => club !== null);

  // 클럽별 활성 멤버 수를 한 번의 쿼리로 집계
  const clubIds = myClubs.map((club) => club.id);
  const { data: allMembers } =
    clubIds.length > 0
      ? await supabase
          .from("club_members")
          .select("club_id")
          .eq("status", "active")
          .in("club_id", clubIds)
      : { data: [] };

  const memberCountMap = new Map<string, number>();
  for (const row of allMembers ?? []) {
    memberCountMap.set(row.club_id, (memberCountMap.get(row.club_id) ?? 0) + 1);
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl mb-2">내 클럽</h1>
          <p className="text-muted-foreground text-sm">
            가입하거나 만든 클럽 목록입니다.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/clubs/join">클럽 가입</Link>
          </Button>
          <Button asChild>
            <Link href="/clubs/new">클럽 생성</Link>
          </Button>
        </div>
      </div>

      {myClubs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 가입하거나 만든 클럽이 없습니다. 새 클럽을 만들거나 초대 코드로
          가입해보세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myClubs.map((club) => (
            <Link key={club.id} href={`/c/${club.slug}`} className="block">
              <ClubCard club={club} memberCount={memberCountMap.get(club.id)} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
