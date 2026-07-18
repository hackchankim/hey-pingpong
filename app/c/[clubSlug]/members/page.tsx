import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dummyClubMembers, dummyUserNames, findClubBySlug } from "@/lib/dummy-data";
import type { ClubRole, MemberStatus } from "@/lib/types/domain";

/** 클럽 내 역할(role)을 한글 라벨 + 배지 스타일로 변환 */
const ROLE_META: Record<ClubRole, { label: string; className: string }> = {
  owner: {
    label: "운영자",
    className: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  admin: {
    label: "관리자",
    className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  member: {
    label: "멤버",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
};

/** 멤버십 상태(status)를 한글 라벨 + 배지 스타일로 변환 */
const STATUS_META: Record<MemberStatus, { label: string; className: string }> = {
  active: {
    label: "활동중",
    className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  banned: {
    label: "차단됨",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
};

export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = findClubBySlug(clubSlug);

  const members = dummyClubMembers.filter((member) => member.club_id === club.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">멤버 관리</h1>
        <p className="text-muted-foreground text-sm">
          {club.name}의 멤버 목록과 권한입니다.
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 멤버가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">가입일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const name = dummyUserNames[member.user_id] ?? "알 수 없음";
                const roleMeta = ROLE_META[member.role];
                const statusMeta = STATUS_META[member.status];

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleMeta.className}>
                        {roleMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusMeta.className}>
                        {statusMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(member.joined_at).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
