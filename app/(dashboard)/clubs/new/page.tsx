import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateClubForm } from "@/components/create-club-form";

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
            클럽 이름과 URL, 소개를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateClubForm />
        </CardContent>
      </Card>
    </div>
  );
}
