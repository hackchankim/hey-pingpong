"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { joinClubWithCode } from "@/lib/actions/clubs";
import type { JoinClubWithCodeResult } from "@/lib/types/actions";

const formSchema = z.object({
  invite_code: z.string().trim().min(1, "초대 코드를 입력해주세요."),
});

type FormValues = z.infer<typeof formSchema>;

/** 실패 사유(success: false)별 한국어 안내 메시지 */
const ERROR_MESSAGES: Record<
  Extract<JoinClubWithCodeResult, { success: false }>["error"],
  string
> = {
  invalid_code: "유효하지 않은 초대 코드입니다.",
  already_member: "이미 가입되어 있는 클럽입니다.",
  banned: "이 클럽에서 차단되어 가입할 수 없습니다.",
};

/** 클럽 가입 폼: react-hook-form + zod 클라이언트 검증 후 joinClubWithCode Server Action 호출 */
export function JoinClubForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invite_code: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const result = await joinClubWithCode({
        invite_code: values.invite_code,
      });

      if (result.success) {
        toast.success(`${result.club.name}에 가입했습니다.`);
        router.push(`/c/${result.club.slug}`);
        return;
      }

      toast.error(ERROR_MESSAGES[result.error]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "클럽 가입 중 오류가 발생했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="invite_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>초대 코드</FormLabel>
              <FormControl>
                <Input placeholder="예: ABCD1234" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "가입 중..." : "가입하기"}
        </Button>
      </form>
    </Form>
  );
}
