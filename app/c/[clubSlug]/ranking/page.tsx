import { RankingTable } from "@/components/ranking-table";
import { dummyClubRatings, dummyUserNames, findClubBySlug } from "@/lib/dummy-data";

export default async function ClubRankingPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = findClubBySlug(clubSlug);

  const ratings = dummyClubRatings.filter((rating) => rating.club_id === club.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">랭킹</h1>
        <p className="text-muted-foreground text-sm">
          {club.name} 멤버들의 ELO 랭킹입니다.
        </p>
      </div>

      <RankingTable ratings={ratings} userNames={dummyUserNames} />
    </div>
  );
}
