import { BracketView } from "@/components/bracket-view";
import {
  dummyMatches,
  dummyUserNames,
  findClubBySlug,
  findTournamentById,
} from "@/lib/dummy-data";

export default async function TournamentBracketPage({
  params,
}: {
  params: Promise<{ clubSlug: string; tournamentId: string }>;
}) {
  const { clubSlug, tournamentId } = await params;

  const club = findClubBySlug(clubSlug);
  const tournament = findTournamentById(club.id, tournamentId);

  const matches = dummyMatches.filter(
    (match) => match.tournament_id === tournament.id,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">{tournament.name} 대진표</h1>
        <p className="text-muted-foreground text-sm">
          라운드별 경기 결과를 확인할 수 있습니다.
        </p>
      </div>

      <BracketView matches={matches} userNames={dummyUserNames} />
    </div>
  );
}
