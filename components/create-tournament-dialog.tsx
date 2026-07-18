"use client"

import { useState, useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { createTournament } from "@/lib/actions/tournaments"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TournamentFormat } from "@/lib/types/domain"

interface CreateTournamentDialogProps {
  clubId: string
}

const FORMAT_OPTIONS: { value: TournamentFormat; label: string }[] = [
  { value: "round_robin", label: "풀리그" },
  { value: "single_elimination", label: "싱글 토너먼트" },
  { value: "double_elimination", label: "더블 엘리미네이션" },
]

const formSchema = z.object({
  name: z.string().trim().min(1, "대회 이름을 입력해주세요.").max(100),
  format: z.enum(
    ["round_robin", "single_elimination", "double_elimination"],
    "진행 방식을 선택해주세요.",
  ),
  max_participants: z
    .string()
    .trim()
    .refine((value) => value === "" || Number.isInteger(Number(value)), {
      message: "숫자만 입력해주세요.",
    }),
  starts_at: z.string().trim(),
})

type FormValues = z.infer<typeof formSchema>

/** 클럽 관리자용 "새 대회 만들기" 다이얼로그. 생성 즉시 참가 신청을 받는 상태로 시작한다. */
export function CreateTournamentDialog({ clubId }: CreateTournamentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      format: "round_robin",
      max_participants: "",
      starts_at: "",
    },
  })

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await createTournament({
          club_id: clubId,
          name: values.name,
          format: values.format,
          max_participants:
            values.max_participants === "" ? null : Number(values.max_participants),
          starts_at: values.starts_at === "" ? null : new Date(values.starts_at).toISOString(),
        })
        toast.success("대회를 생성했습니다.")
        form.reset()
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "대회 생성에 실패했습니다.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="w-fit">
          <PlusIcon className="size-4" />
          새 대회 만들기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 대회 만들기</DialogTitle>
          <DialogDescription>
            생성하면 즉시 참가 신청을 받는 상태로 시작합니다.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>대회 이름</FormLabel>
                  <FormControl>
                    <Input placeholder="예: 2026 여름 정기 리그" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>진행 방식</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="진행 방식을 선택해주세요." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="max_participants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>최대 참가 인원 (선택)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="제한 없음"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="starts_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>대회 시작일 (선택)</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "생성 중..." : "대회 만들기"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
