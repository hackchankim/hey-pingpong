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
          <form className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="invite-code">초대 코드</Label>
              <Input id="invite-code" placeholder="예: ABCD1234" />
            </div>
            <Button type="button" disabled className="w-fit">
              가입하기
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
