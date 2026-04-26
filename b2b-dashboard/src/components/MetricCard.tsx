import type { LucideIcon } from "lucide-react"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  deltaLabel?: string
  icon: LucideIcon
  accent?: "emerald" | "violet" | "stone"
}) {
  const accentBar = {
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    stone: "bg-stone-500",
  }[accent ?? "emerald"]

  const isDown = typeof delta === "number" && delta < 0
  const deltaColor = isDown ? "text-rose-600" : "text-emerald-600"
  const DeltaIcon = isDown ? ArrowDownRight : ArrowUpRight

  return (
    <Card className="relative gap-0 overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", accentBar)} />

      <div className="flex items-start justify-between">
        <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="grid h-7 w-7 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-sans text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>

      {typeof delta === "number" && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px]">
          <span className={cn("inline-flex items-center gap-0.5 font-medium", deltaColor)}>
            <DeltaIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            {Math.abs(delta)}%
          </span>
          <span className="text-muted-foreground">{deltaLabel ?? "vs. last month"}</span>
        </div>
      )}
    </Card>
  )
}
