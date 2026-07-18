import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewClubPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">클럽 생성</h1>
        <p className="text-muted-foreground text-sm">
          새로운 클럽을 만들어 대회와 랭킹을 관리해보세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>클럽 정보</CardTitle>
          <CardDescription>
            클럽 이름과 소개를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="club-name">클럽 이름</Label>
              <Input id="club-name" placeholder="예: 강남 탁구 동호회" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="club-description">클럽 소개</Label>
              <Input
                id="club-description"
                placeholder="클럽에 대한 간단한 소개를 입력해주세요"
              />
            </div>
            <Button type="button" disabled className="w-fit">
              생성하기
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
