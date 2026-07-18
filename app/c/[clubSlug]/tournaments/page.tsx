import Link from "next/link";

import { TournamentCard } from "@/components/tournament-card";
import { Button } from "@/components/ui/button";
import { dummyTournaments, findClubBySlug } from "@/lib/dummy-data";

export default async function ClubTournamentsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = findClubBySlug(clubSlug);

  const tournaments = dummyTournaments.filter(
    (tournament) => tournament.club_id === club.id,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl mb-2">대회</h1>
          <p className="text-muted-foreground text-sm">
            {club.name}에서 진행 중이거나 예정된 대회 목록입니다.
          </p>
        </div>
        {/* TODO: 새 대회 생성 로직 구현 필요 (범위 밖) */}
        <Button type="button" disabled className="w-fit">
          새 대회 만들기
        </Button>
      </div>

      {tournaments.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 등록된 대회가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/c/${clubSlug}/tournaments/${tournament.id}`}
              className="block"
            >
              <TournamentCard tournament={tournament} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
