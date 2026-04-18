import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Brand } from "@/lib/mock"

const sectionTitles: Record<string, { title: string; sub: string }> = {
  overview: { title: "Overview", sub: "Network health across your brand." },
  locations: { title: "Locations", sub: "Physical branches enrolled under your brand." },
  billing: { title: "Billing", sub: "Subscription, invoices, and payment method." },
  settings: { title: "Settings", sub: "Brand profile and loyalty scheme." },
}

export function Topbar({
  section,
  brand,
  onOpenAddLocation,
}: {
  section: keyof typeof sectionTitles
  brand: Brand
  onOpenAddLocation: () => void
}) {
  const meta = sectionTitles[section]
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-8 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {meta.title}
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {brand.schemeType === "global" ? "Global · Indie Loop" : "Private · Walled Garden"}
          </span>
        </div>
        <p className="truncate text-[12px] text-muted-foreground">{meta.sub}</p>
      </div>

      <div className="hidden items-center md:flex">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search locations, till codes…"
            className="h-9 w-72 pl-8 text-sm"
          />
        </div>
      </div>

      <Button onClick={onOpenAddLocation} size="sm" className="h-9 gap-1.5 font-medium">
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Add New Location
      </Button>
    </header>
  )
}
