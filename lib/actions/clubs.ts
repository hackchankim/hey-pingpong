"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type {
  CreateClubInput,
  CreateClubResult,
  JoinClubWithCodeInput,
  JoinClubWithCodeResult,
} from "@/lib/types/actions";

// ---------------------------------------------------------------------------
// 클럽 생성 (F001) — create_club RPC
// ---------------------------------------------------------------------------

const createClubSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "클럽 이름은 2자 이상이어야 합니다.")
    .max(50, "클럽 이름은 50자 이하여야 합니다."),
  slug: z
    .string()
    .trim()
    .min(2, "클럽 URL은 2자 이상이어야 합니다.")
    .max(50, "클럽 URL은 50자 이하여야 합니다.")
    .regex(
      /^[a-z0-9-]+$/,
      "클럽 URL은 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.",
    ),
  description: z
    .string()
    .trim()
    .max(500, "클럽 소개는 500자 이하여야 합니다.")
    .optional()
    .nullable(),
});

/** create_club RPC의 반환 json 형태 (json_build_object로 clubs/club_members 컬럼을 구성) */
interface CreateClubRpcResponse {
  club: CreateClubResult["club"];
  membership: CreateClubResult["membership"];
}

export async function createClub(
  input: CreateClubInput,
): Promise<CreateClubResult> {
  const parsed = createClubSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_club", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_description: parsed.data.description ?? undefined,
  });

  if (error) {
    console.error("[createClub] create_club RPC failed", error);
    // 23505 = unique_violation. create_club RPC는 slug 충돌 시 재시도 없이 그대로
    // 예외를 전파하므로(invite_code 충돌은 RPC 내부에서 이미 재시도 처리됨), 여기서
    // 잡히는 unique_violation은 사실상 slug 중복으로 취급해 사용자용 메시지로 매핑한다.
    if (error.code === "23505") {
      throw new Error("이미 사용 중인 클럽 URL입니다. 다른 URL을 입력해주세요.");
    }
    throw new Error("클럽 생성 중 오류가 발생했습니다.");
  }

  const result = data as unknown as CreateClubRpcResponse;

  revalidatePath("/dashboard");

  return { club: result.club, membership: result.membership };
}

// ---------------------------------------------------------------------------
// 초대코드로 클럽 가입 (F002) — join_club_with_code RPC
// ---------------------------------------------------------------------------

const joinClubWithCodeSchema = z.object({
  invite_code: z.string().trim().min(1, "초대 코드를 입력해주세요."),
});

export async function joinClubWithCode(
  input: JoinClubWithCodeInput,
): Promise<JoinClubWithCodeResult> {
  const parsed = joinClubWithCodeSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "invalid_code" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("join_club_with_code", {
    p_invite_code: parsed.data.invite_code,
  });

  if (error) {
    console.error("[joinClubWithCode] join_club_with_code RPC failed", error);
    throw new Error("클럽 가입 중 오류가 발생했습니다.");
  }

  const result = data as unknown as JoinClubWithCodeResult;

  if (result.success) {
    revalidatePath("/dashboard");
  }

  return result;
}

// ---------------------------------------------------------------------------
// 멤버 역할 변경 (F003) — owner 강등/승격은 절대 허용하지 않는다
// ---------------------------------------------------------------------------

/**
 * 멤버 역할을 member/admin 사이로만 변경한다. `role` 파라미터 타입 자체가
 * "member" | "admin"만 허용하므로 owner로의 승격은 타입 레벨에서부터 불가능하며,
 * 대상이 이미 owner인 경우(강등 시도)는 update 전에 명시적으로 막는다(애플리케이션
 * 레이어 1차 방어). `club_members_update_admin` RLS 정책도 `role <> 'owner'`를
 * USING/WITH CHECK 양쪽에 걸어 DB 레벨에서 동일하게 막는다(2차 방어, PostgREST 직접
 * 호출로 이 Server Action을 우회하더라도 안전).
 */
export async function updateMemberRole(
  clubId: string,
  memberId: string,
  role: "member" | "admin",
): Promise<void> {
  const supabase = await createClient();

  const { data: target, error: fetchError } = await supabase
    .from("club_members")
    .select("role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (fetchError || !target) {
    throw new Error("멤버 정보를 찾을 수 없습니다.");
  }

  if (target.role === "owner") {
    throw new Error("클럽 소유자의 역할은 변경할 수 없습니다.");
  }

  // RLS로 대상 행이 걸러지면 PostgREST는 에러 없이 0건 업데이트로 조용히 끝내므로,
  // .select().single()로 실제 갱신된 행을 요구해 0건이면 에러로 취급되게 한다.
  const { data: updated, error } = await supabase
    .from("club_members")
    .update({ role })
    .eq("id", memberId)
    .eq("club_id", clubId)
    .select("id")
    .single();

  if (error || !updated) {
    console.error("[updateMemberRole] update failed", error);
    throw new Error("역할 변경 중 오류가 발생했습니다.");
  }

  // 클럽 슬러그를 알 수 없는 위치에서도 호출되므로, 동적 세그먼트 리터럴로 멤버 관리 페이지를
  // 포함한 클럽 스코프 전체를 재검증한다.
  revalidatePath("/c/[clubSlug]", "layout");
}

// ---------------------------------------------------------------------------
// 멤버 제거
// ---------------------------------------------------------------------------

/**
 * owner는 절대 제거할 수 없다(강제 축출 방지). updateMemberRole과 동일하게
 * 대상 role을 먼저 조회해 owner면 애플리케이션 레이어에서 막고(1차 방어),
 * `club_members_delete_admin_or_self` RLS 정책도 admin 경로에는 `role <> 'owner'`를
 * 요구해 DB 레벨에서 동일하게 막는다(2차 방어). 본인이 owner인 경우의 자진 탈퇴는
 * `user_id = auth.uid()` 절로 여전히 허용된다.
 */
export async function removeMember(
  clubId: string,
  memberId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: target, error: fetchError } = await supabase
    .from("club_members")
    .select("role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (fetchError || !target) {
    throw new Error("멤버 정보를 찾을 수 없습니다.");
  }

  if (target.role === "owner") {
    throw new Error("클럽 소유자는 제거할 수 없습니다.");
  }

  // RLS로 대상 행이 걸러지면 PostgREST는 에러 없이 0건 삭제로 조용히 끝내므로,
  // .select().single()로 실제 삭제된 행을 요구해 0건이면 에러로 취급되게 한다.
  const { data: deleted, error } = await supabase
    .from("club_members")
    .delete()
    .eq("id", memberId)
    .eq("club_id", clubId)
    .select("id")
    .single();

  if (error || !deleted) {
    console.error("[removeMember] delete failed", error);
    throw new Error("멤버 제거 중 오류가 발생했습니다.");
  }

  revalidatePath("/c/[clubSlug]", "layout");
}
