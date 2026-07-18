"use client"

import { useState, useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm } from "react-hook-form"
import { z } from "zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { recordMatchResult } from "@/lib/actions/matches"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import type { Match } from "@/lib/types/domain"

interface ScoreEntryDialogProps {
  match: Match
  player1Name: string
  player2Name: string
}

const formSchema = z
  .object({
    isWalkover: z.boolean(),
    walkoverWinner: z.enum(["player1", "player2"]).optional(),
    games: z.array(
      z.object({
        player1_score: z
          .string()
          .trim()
          .regex(/^\d+$/, "숫자만 입력해주세요."),
        player2_score: z
          .string()
          .trim()
          .regex(/^\d+$/, "숫자만 입력해주세요."),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.isWalkover) {
      if (!data.walkoverWinner) {
        ctx.addIssue({
          code: "custom",
          path: ["walkoverWinner"],
          message: "부전승 승자를 선택해주세요.",
        })
      }
      return
    }

    if (data.games.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["games"],
        message: "세트를 하나 이상 입력해주세요.",
      })
    }
  })

type FormValues = z.infer<typeof formSchema>

/**
 * 관리자 전용 경기 결과 입력 다이얼로그. 세트별 점수를 여러 개 입력하거나
 * "부전승 처리" 토글로 게임 점수 없이 승자만 확정할 수 있다. 어느 경로든
 * record_match_result RPC 하나로 원자적으로 처리된다(경기 상태 갱신 + 다음 라운드
 * 진출 배정 + 대회 완료 판정이 한 트랜잭션에서 일관되어야 하므로).
 */
export function ScoreEntryDialog({ match, player1Name, player2Name }: ScoreEntryDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isWalkover: false,
      walkoverWinner: undefined,
      games: [{ player1_score: "", player2_score: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "games",
  })

  const isWalkover = form.watch("isWalkover")

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        if (values.isWalkover) {
          const winnerId =
            values.walkoverWinner === "player1" ? match.player1_id : match.player2_id

          if (!winnerId) {
            throw new Error("아직 양쪽 선수가 모두 확정되지 않았습니다.")
          }

          await recordMatchResult({
            match_id: match.id,
            games: [],
            walkover_winner_id: winnerId,
          })
        } else {
          await recordMatchResult({
            match_id: match.id,
            games: values.games.map((game, index) => ({
              game_number: index + 1,
              player1_score: Number(game.player1_score),
              player2_score: Number(game.player2_score),
            })),
          })
        }

        toast.success("경기 결과를 기록했습니다.")
        form.reset()
        setOpen(false)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "경기 결과 기록에 실패했습니다.",
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          점수 입력
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>경기 결과 입력</DialogTitle>
          <DialogDescription>
            {player1Name} vs {player2Name}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="isWalkover"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">부전승 처리</FormLabel>
                </FormItem>
              )}
            />

            {isWalkover ? (
              <FormField
                control={form.control}
                name="walkoverWinner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>승자</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="승자를 선택해주세요." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="player1">{player1Name}</SelectItem>
                        <SelectItem value="player2">{player2Name}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
                  <span>{player1Name}</span>
                  <span>{player2Name}</span>
                  <span />
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`games.${index}.player1_score`}
                      render={({ field: scoreField }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              {...scoreField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`games.${index}.player2_score`}
                      render={({ field: scoreField }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              {...scoreField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => append({ player1_score: "", player2_score: "" })}
                >
                  <PlusIcon className="size-4" />
                  세트 추가
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "저장 중..." : "결과 저장"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
