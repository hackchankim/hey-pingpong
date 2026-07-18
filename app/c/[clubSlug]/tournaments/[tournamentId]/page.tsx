import Link from "next/link";

import { ParticipantList } from "@/components/participant-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dummyParticipants,
  dummyUserNames,
  findClubBySlug,
  findTournamentById,
} from "@/lib/dummy-data";
import type { TournamentFormat, TournamentStatus } from "@/lib/types/domain";

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

  const club = findClubBySlug(clubSlug);
  const tournament = findTournamentById(club.id, tournamentId);

  const participants = dummyParticipants.filter(
    (participant) => participant.tournament_id === tournament.id,
  );

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
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/c/${clubSlug}/tournaments/${tournament.id}/bracket`}>
            대진표 보기
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">참가자 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <ParticipantList participants={participants} userNames={dummyUserNames} />
        </CardContent>
      </Card>
    </div>
  );
}
