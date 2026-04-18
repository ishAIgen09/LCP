import { Scan, Store, Sparkles, ArrowUpRight } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/MetricCard"
import type { Brand, Cafe } from "@/lib/mock"

function formatNumber(n: number) {
  return n.toLocaleString("en-GB")
}

export function OverviewView({ brand, cafes }: { brand: Brand; cafes: Cafe[] }) {
  const totalScans = cafes.reduce((n, c) => n + c.scansThisMonth, 0)
  const activeBranches = cafes.filter((c) => c.status === "live").length

  const recent = cafes
    .slice()
    .sort((a, b) => b.scansThisMonth - a.scansThisMonth)
    .slice(0, 4)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Total scans"
          value={formatNumber(totalScans)}
          unit="this month"
          delta={18.4}
          icon={Scan}
          accent="emerald"
        />
        <MetricCard
          label="Active branches"
          value={String(activeBranches)}
          unit={`/ ${cafes.length}`}
          delta={4.2}
          deltaLabel="vs. last quarter"
          icon={Store}
          accent="violet"
        />
        <MetricCard
          label="Current plan"
          value={brand.plan}
          unit={brand.planPrice}
          delta={0}
          deltaLabel="Renews 1 May"
          icon={Sparkles}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-[15px] tracking-tight">Top performing branches</CardTitle>
              <CardDescription>Scans across the last 30 days.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              View all
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-[12.5px] text-muted-foreground">
                No branches yet. Add your first location to start collecting scans.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((c) => {
                  const max = Math.max(1, ...recent.map((r) => r.scansThisMonth))
                  const pct = Math.round((c.scansThisMonth / max) * 100)
                  return (
                    <li key={c.id} className="flex items-center gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
                          {c.name}
                        </div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {c.address}
                        </div>
                      </div>
                      <div className="hidden w-40 sm:block">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-20 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                        {formatNumber(c.scansThisMonth)}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="text-[15px] tracking-tight">Loyalty scheme</CardTitle>
            <CardDescription>
              {brand.schemeType === "global"
                ? "You're part of the shared Indie Loop network."
                : "You're running a private walled-garden scheme."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    brand.schemeType === "global" ? "bg-emerald-500" : "bg-violet-500"
                  }`}
                />
                {brand.schemeType === "global" ? "Global" : "Private"}
              </div>
              <div className="mt-1.5 text-[13.5px] leading-snug text-foreground">
                {brand.schemeType === "global"
                  ? "Customers can earn stamps at any Indie Loop cafe. Great for discovery."
                  : "Stamps are locked to your own cafes. Best for established chains."}
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8 w-full text-xs">
              Change scheme type
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
