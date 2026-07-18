import { createClient } from "@/lib/supabase/server";
import { ClubNav } from "@/components/club-nav";
import { redirect } from "next/navigation";
import { Suspense } from "react";

/**
 * `params`(동적 라우트 세그먼트)와 `getClaims()`(인증 확인) 모두 요청마다 달라지는
 * 값이라 cacheComponents 하에서는 <Suspense> 경계 안에서만 접근할 수 있다.
 * 두 접근을 한 컴포넌트로 묶어 단일 Suspense로 감싼다.
 */
async function ClubLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full max-w-5xl flex flex-col gap-6 p-5">
      <ClubNav clubSlug={clubSlug} />
      <div className="flex-1 flex flex-col gap-6">{children}</div>
    </div>
  );
}

export default function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <Suspense>
        <ClubLayoutContent params={params}>{children}</ClubLayoutContent>
      </Suspense>
    </main>
  );
}
