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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClub } from "@/lib/actions/clubs";

const formSchema = z.object({
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
      "소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.",
    ),
  description: z
    .string()
    .trim()
    .max(500, "클럽 소개는 500자 이하여야 합니다.")
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

/** 클럽 생성 폼: react-hook-form + zod 클라이언트 검증 후 createClub Server Action 호출 */
export function CreateClubForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const result = await createClub({
        name: values.name,
        slug: values.slug,
        description: values.description || null,
      });

      toast.success("클럽이 생성되었습니다.");
      router.push(`/c/${result.club.slug}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "클럽 생성 중 오류가 발생했습니다.",
      );
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>클럽 이름</FormLabel>
              <FormControl>
                <Input placeholder="예: 강남 탁구 동호회" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>클럽 URL</FormLabel>
              <FormControl>
                <Input placeholder="예: gangnam-tabletennis" {...field} />
              </FormControl>
              <FormDescription>
                /c/{field.value || "your-slug"} 형식의 클럽 주소로 사용됩니다.
                소문자, 숫자, 하이픈만 사용할 수 있습니다.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>클럽 소개</FormLabel>
              <FormControl>
                <Input
                  placeholder="클럽에 대한 간단한 소개를 입력해주세요"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "생성 중..." : "생성하기"}
        </Button>
      </form>
    </Form>
  );
}
