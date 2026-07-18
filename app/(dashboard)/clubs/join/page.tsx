import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JoinClubForm } from "@/components/join-club-form";

export default function JoinClubPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="font-bold text-2xl mb-2">클럽 가입</h1>
        <p className="text-muted-foreground text-sm">
          초대 코드를 입력하여 기존 클럽에 가입하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>초대 코드</CardTitle>
          <CardDescription>
            클럽 운영진에게 받은 초대 코드를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinClubForm />
        </CardContent>
      </Card>
    </div>
  );
}
