import Link from "next/link";

import { ClubCard } from "@/components/club-card";
import { Button } from "@/components/ui/button";
import { dummyClubMembers, dummyClubs } from "@/lib/dummy-data";

export default function DashboardPage() {
  // TODO: 실제 로그인 사용자가 속한 클럽만 필터링해야 함 (Task 005 이후 Supabase 연동)
  const myClubs = dummyClubs;

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

      {/* 클럽 카드 반응형 그리드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {myClubs.map((club) => {
          const memberCount = dummyClubMembers.filter(
            (member) => member.club_id === club.id,
          ).length;

          return (
            <Link key={club.id} href={`/c/${club.slug}`} className="block">
              <ClubCard club={club} memberCount={memberCount} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
