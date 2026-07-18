import { notFound } from "next/navigation";

import { RankingTable } from "@/components/ranking-table";
import { createClient } from "@/lib/supabase/server";

export default async function ClubRankingPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;

  const supabase = await createClient();

  // RLS(clubs_select_member)가 비멤버의 조회를 자동 차단하므로, members/page.tsx와 동일하게
  // "존재하지 않음"과 "권한 없음"을 굳이 구분하지 않고 404로 처리한다.
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const { data: ratings } = await supabase
    .from("club_ratings")
    .select("*, profiles(id, full_name, username)")
    .eq("club_id", club.id)
    .order("rating", { ascending: false });

  const userNames: Record<string, string> = Object.fromEntries(
    (ratings ?? []).map((rating) => [
      rating.user_id,
      rating.profiles?.full_name ?? rating.profiles?.username ?? "알 수 없음",
    ]),
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims?.sub;

  const { data: history } = currentUserId
    ? await supabase
        .from("rating_history")
        .select("*, opponent:profiles!rating_history_opponent_id_fkey(full_name, username)")
        .eq("club_id", club.id)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">랭킹</h1>
        <p className="text-muted-foreground text-sm">
          {club.name} 멤버들의 ELO 랭킹입니다.
        </p>
      </div>

      <RankingTable ratings={ratings ?? []} userNames={userNames} />

      {currentUserId && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-lg">내 레이팅 변동 내역</h2>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 레이팅 변동 내역이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => {
                const opponentName =
                  entry.opponent?.full_name ?? entry.opponent?.username ?? "알 수 없음";
                const isPositive = entry.delta >= 0;

                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border px-4 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString("ko-KR")} · vs {opponentName}
                    </span>
                    <span
                      className={
                        isPositive
                          ? "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                          : "font-semibold tabular-nums text-destructive"
                      }
                    >
                      {isPositive ? "+" : ""}
                      {entry.delta} ({entry.rating_before} → {entry.rating_after})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
