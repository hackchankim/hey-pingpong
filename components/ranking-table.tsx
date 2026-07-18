import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ClubRating } from "@/lib/types/domain"

interface RankingTableProps {
  /** 순위를 매길 클럽 레이팅 목록 (정렬은 컴포넌트 내부에서 레이팅 내림차순으로 처리) */
  ratings: ClubRating[]
  /** user_id -> 표시용 이름 매핑 */
  userNames: Record<string, string>
}

/** 클럽 랭킹을 레이팅 내림차순 테이블로 표시하는 컴포넌트 */
export function RankingTable({ ratings, userNames }: RankingTableProps) {
  const sorted = [...ratings].sort((a, b) => b.rating - a.rating)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-center">순위</TableHead>
          <TableHead>이름</TableHead>
          <TableHead className="text-right">레이팅</TableHead>
          <TableHead className="text-right">전적</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
              표시할 랭킹 데이터가 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((rating, index) => (
            <TableRow key={rating.id}>
              <TableCell className="text-center font-medium">{index + 1}</TableCell>
              <TableCell>{userNames[rating.user_id] ?? "알 수 없음"}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {rating.rating}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {rating.wins}승 {rating.losses}패
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
