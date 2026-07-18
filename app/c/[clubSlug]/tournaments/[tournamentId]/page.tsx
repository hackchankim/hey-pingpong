import Link from "next/link";
import { notFound } from "next/navigation";

import { CloseRegistrationButton } from "@/components/close-registration-button";
import { ParticipantAdminPanel } from "@/components/participant-admin-panel";
import { ParticipantList } from "@/components/participant-list";
import { TournamentRegistrationAction } from "@/components/tournament-registration-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type {
  ParticipantStatus,
  TournamentFormat,
  TournamentParticipant,
  TournamentStatus,
} from "@/lib/types/domain";

/** 대회 진행 방식(format)을 한글 라벨로 변환 */
const FORMAT_LABELS: Record<TournamentFormat, string> = {
  round_robin: "풀리그",
  single_elimination: "싱글 토너먼트",
  double_elimination: "더블 엘리미네이션",
};

/** 대회 상태(status)를 한글 라벨 + 배지 스타일로 변환 */
const STATUS_META: Record<TournamentStatus, { label: string; className: string }> = {
  draft: {
    label: "준비중",
    className: "border-transparent bg-muted text-muted-foreground",
  },
  registration_open: {
    label: "모집중",
    className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  in_progress: {
    label: "진행중",
    className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  completed: {
    label: "종료",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  cancelled: {
    label: "취소됨",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ clubSlug: string; tournamentId: string }>;
}) {
  const { clubSlug, tournamentId } = await params;
  const supabase = await createClient();

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
    .select("*")
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .single();

  if (tournamentError || !tournament) {
    notFound();
  }

  const [{ data: isAdmin }, { data: claimsData }, { data: participantRows }] =
    await Promise.all([
      supabase.rpc("is_club_admin", { target_club_id: club.id }),
      supabase.auth.getClaims(),
      supabase
        .from("tournament_participants")
        .select("*, profiles(full_name, username)")
        .eq("tournament_id", tournament.id)
        .order("created_at", { ascending: true }),
    ]);

  const currentUserId = claimsData?.claims?.sub ?? null;

  const participants: TournamentParticipant[] = participantRows ?? [];

  const userNames: Record<string, string> = Object.fromEntries(
    (participantRows ?? []).map((row) => [
      row.user_id,
      row.profiles?.full_name ?? row.profiles?.username ?? "알 수 없음",
    ]),
  );

  const myParticipant = currentUserId
    ? participants.find((participant) => participant.user_id === currentUserId)
    : undefined;
  const myStatus: ParticipantStatus | null = myParticipant?.status ?? null;

  const registrationOpen =
    tournament.status === "registration_open" &&
    (!tournament.registration_deadline ||
      new Date(tournament.registration_deadline).getTime() > Date.now());

  const pendingParticipants = participants
    .filter((participant) => participant.status === "pending")
    .map((participant) => ({
      id: participant.id,
      name: userNames[participant.user_id] ?? "알 수 없음",
    }));

  const statusMeta = STATUS_META[tournament.status];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="font-bold text-2xl">{tournament.name}</h1>
            <Badge variant="outline" className={statusMeta.className}>
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {FORMAT_LABELS[tournament.format]}
            {typeof tournament.max_participants === "number" &&
              ` · 최대 ${tournament.max_participants}명`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <CloseRegistrationButton tournamentId={tournament.id} />}
          {!isAdmin && (
            <TournamentRegistrationAction
              tournamentId={tournament.id}
              registrationOpen={registrationOpen}
              currentStatus={myStatus}
            />
          )}
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/c/${clubSlug}/tournaments/${tournament.id}/bracket`}>
              대진표 보기
            </Link>
          </Button>
        </div>
      </div>

      {isAdmin && pendingParticipants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">승인 대기 중인 참가자</CardTitle>
          </CardHeader>
          <CardContent>
            <ParticipantAdminPanel
              tournamentId={tournament.id}
              participants={pendingParticipants}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">참가자 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <ParticipantList participants={participants} userNames={userNames} />
        </CardContent>
      </Card>
    </div>
  );
}
