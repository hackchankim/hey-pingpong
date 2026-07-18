import Link from "next/link";
import { notFound } from "next/navigation";

import { TournamentCard } from "@/components/tournament-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Tournament } from "@/lib/types/domain";

export default async function ClubHomePage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  // RLS(clubs_select_member)가 비멤버의 조회를 자동 차단하므로, members/tournaments/ranking
  // 페이지와 동일하게 "존재하지 않음"과 "권한 없음"을 굳이 구분하지 않고 404로 처리한다.
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const [{ data: inProgressTournaments }, { data: topRatings }] =
    await Promise.all([
      supabase
        .from("tournaments")
        .select("*")
        .eq("club_id", club.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false }),
      supabase
        .from("club_ratings")
        .select("*, profiles(id, full_name, username)")
        .eq("club_id", club.id)
        .order("rating", { ascending: false })
        .limit(2),
    ]);

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
        {!inProgressTournaments || inProgressTournaments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            현재 진행 중인 대회가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* ruleset: Json(생성 타입) vs Record<string, unknown>(도메인 타입)은 구조적으로
                완전히 호환되지 않아(Json은 원시값도 포함) 여기서만 캐스팅한다. */}
            {(inProgressTournaments as unknown as Tournament[]).map(
              (tournament) => (
                <Link
                  key={tournament.id}
                  href={`/c/${clubSlug}/tournaments/${tournament.id}`}
                  className="block"
                >
                  <TournamentCard tournament={tournament} />
                </Link>
              ),
            )}
          </div>
        )}
      </section>

      {/* 랭킹 요약 */}
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">랭킹 요약</h2>
        {!topRatings || topRatings.length === 0 ? (
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
                    <span>
                      {rating.profiles?.full_name ??
                        rating.profiles?.username ??
                        "알 수 없음"}
                    </span>
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
