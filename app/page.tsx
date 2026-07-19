import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";
import { ListChecks, ShieldCheck, Trophy, Users } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "초대코드로 구장 운영",
    description: "초대코드 하나로 우리 구장만의 폐쇄형 커뮤니티를 만들고 회원을 모집하세요.",
  },
  {
    icon: ListChecks,
    title: "자동 대진표 생성",
    description: "풀리그·싱글/더블 엘리미네이션까지, 참가자만 확정하면 대진표를 자동으로 짜드립니다.",
  },
  {
    icon: ShieldCheck,
    title: "점수 입력만으로 자동 진행",
    description: "세트 점수만 입력하면 승패 판정과 다음 라운드 진출까지 한 번에 처리됩니다.",
  },
  {
    icon: Trophy,
    title: "ELO 기반 랭킹",
    description: "경기 결과마다 레이팅이 자동으로 갱신되는 구장별 순위표로 승부욕을 자극하세요.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-16 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <Link href="/" className="font-semibold">
              Hey Pingpong
            </Link>
            <div className="flex items-center gap-3">
              <Suspense>
                <AuthButton />
              </Suspense>
              <ThemeSwitcher />
            </div>
          </div>
        </nav>

        <div className="flex-1 flex flex-col gap-16 max-w-5xl w-full p-5">
          <section className="flex flex-col items-center gap-6 text-center py-12">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              수기 대진표는 이제 그만
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              사설 체육관의 탁구·테니스 대회를 위한 구장 전용 리그/랭킹 관리 플랫폼입니다.
              대진표 작성과 점수 계산을 자동화해 대회 운영에만 집중하세요.
            </p>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link href="/auth/sign-up">회원가입하고 시작하기</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/login">로그인</Link>
              </Button>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-16">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </section>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs text-muted-foreground gap-8 py-8">
          <p>탁구/테니스 동호회를 위한 생활체육 리그/랭킹 관리 플랫폼</p>
        </footer>
      </div>
    </main>
  );
}
