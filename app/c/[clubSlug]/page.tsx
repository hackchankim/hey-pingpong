import Link from "next/link";

import { TournamentCard } from "@/components/tournament-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dummyClubRatings,
  dummyTournaments,
  dummyUserNames,
  findClubBySlug,
} from "@/lib/dummy-data";

export default async function ClubHomePage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = findClubBySlug(clubSlug);

  const inProgressTournaments = dummyTournaments.filter(
    (tournament) =>
      tournament.club_id === club.id && tournament.status === "in_progress",
  );

  const topRatings = [...dummyClubRatings]
    .filter((rating) => rating.club_id === club.id)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-8">
      {/* 클럽 소개 */}
      <div>
        <h1 className="font-bold text-2xl mb-2">{club.name}</h1>
        <p className="text-muted-foreground text-sm">
          {club.description ?? "클럽 소개가 아직 없습니다."}
        </p>
      </div>

      {/* 진행 중인 대회 요약 */}
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">진행 중인 대회</h2>
        {inProgressTournaments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            현재 진행 중인 대회가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgressTournaments.map((tournament) => (
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
      </section>

      {/* 랭킹 요약 (TODO: 실제 로그인 사용자 매핑 후 "내 순위" 카드로 교체, Task 005 이후) */}
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">랭킹 요약</h2>
        {topRatings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 집계된 랭킹이 없습니다.
          </p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">상위 랭커</CardTitle>
              <CardDescription>
                자세한 랭킹은 랭킹 탭에서 확인할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {topRatings.map((rating, index) => (
                <div
                  key={rating.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">
                      {index + 1}위
                    </span>
                    <span>{dummyUserNames[rating.user_id] ?? "알 수 없음"}</span>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {rating.rating}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
