import { notFound } from "next/navigation";

import { BracketView } from "@/components/bracket-view";
import { CreateBracketButton } from "@/components/create-bracket-button";
import { ScoreEntryDialog } from "@/components/score-entry-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types/domain";

export default async function TournamentBracketPage({
  params,
}: {
  params: Promise<{ clubSlug: string; tournamentId: string }>;
}) {
  const { clubSlug, tournamentId } = await params;
  const supabase = await createClient();

  // RLS(clubs_select_member)가 비멤버의 조회를 자동 차단하므로, 여기서 club이 없다면
  // "존재하지 않음"과 "권한 없음"을 굳이 구분하지 않고 404로 처리한다.
  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .eq("slug", clubSlug)
    .single();

  if (clubError || !club) {
    notFound();
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .single();

  if (tournamentError || !tournament) {
    notFound();
  }

  const [{ data: isAdmin }, { data: matchRows }, { count: registeredCount }] =
    await Promise.all([
      supabase.rpc("is_club_admin", { target_club_id: club.id }),
      supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round", { ascending: true })
        .order("match_number", { ascending: true }),
      supabase
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("status", "registered"),
    ]);

  const matches: Match[] = matchRows ?? [];

  const playerIds = Array.from(
    new Set(
      matches.flatMap((match) => [match.player1_id, match.player2_id]).filter(
        (id): id is string => id !== null,
      ),
    ),
  );

  const userNames: Record<string, string> = {};
  if (playerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .in("id", playerIds);

    for (const profile of profiles ?? []) {
      userNames[profile.id] = profile.full_name ?? profile.username ?? "알 수 없음";
    }
  }

  const canCreateBracket = (registeredCount ?? 0) >= 2;
  const inProgressMatches = matches.filter(
    (match) => match.status === "ready" || match.status === "in_progress",
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">{tournament.name} 대진표</h1>
        <p className="text-muted-foreground text-sm">
          라운드별 경기 결과를 확인할 수 있습니다.
        </p>
      </div>

      {matches.length === 0 ? (
        isAdmin ? (
          <div className="flex flex-col items-start gap-2">
            <CreateBracketButton tournamentId={tournament.id} disabled={!canCreateBracket} />
            {!canCreateBracket && (
              <p className="text-sm text-muted-foreground">
                대진표를 생성하려면 승인된 참가자가 2명 이상 필요합니다.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            아직 대진표가 생성되지 않았습니다.
          </p>
        )
      ) : (
        <>
          <BracketView matches={matches} userNames={userNames} />

          {isAdmin && inProgressMatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">경기 결과 입력</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {inProgressMatches.map((match) => {
                  const player1Name = match.player1_id
                    ? userNames[match.player1_id] ?? "알 수 없음"
                    : "미정";
                  const player2Name = match.player2_id
                    ? userNames[match.player2_id] ?? "알 수 없음"
                    : "미정";

                  return (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">
                        {match.round}라운드 · {player1Name} vs {player2Name}
                      </span>
                      <ScoreEntryDialog
                        match={match}
                        player1Name={player1Name}
                        player2Name={player2Name}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
