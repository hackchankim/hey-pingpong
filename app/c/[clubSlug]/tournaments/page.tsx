import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateTournamentDialog } from "@/components/create-tournament-dialog";
import { TournamentCard } from "@/components/tournament-card";
import { createClient } from "@/lib/supabase/server";
import type { Tournament } from "@/lib/types/domain";

export default async function ClubTournamentsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .eq("slug", clubSlug)
    .single();

  if (clubError || !club) {
    notFound();
  }

  const [{ data: isAdmin }, { data: tournaments }] = await Promise.all([
    supabase.rpc("is_club_admin", { target_club_id: club.id }),
    supabase
      .from("tournaments")
      .select("*")
      .eq("club_id", club.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl mb-2">대회</h1>
          <p className="text-muted-foreground text-sm">
            {club.name}에서 진행 중이거나 예정된 대회 목록입니다.
          </p>
        </div>
        {isAdmin && <CreateTournamentDialog clubId={club.id} />}
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 등록된 대회가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* ruleset: Json(생성 타입) vs Record<string, unknown>(도메인 타입)은 구조적으로
              완전히 호환되지 않아(Json은 원시값도 포함) 여기서만 캐스팅한다. */}
          {(tournaments as unknown as Tournament[]).map((tournament) => (
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
