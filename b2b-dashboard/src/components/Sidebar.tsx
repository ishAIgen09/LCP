import { LayoutDashboard, MapPin, CreditCard, Settings, Coffee, LogOut, Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"

export type NavKey = "overview" | "locations" | "promotions" | "billing" | "settings"

const items: { key: NavKey; label: string; icon: typeof Coffee }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "promotions", label: "Promotions", icon: Megaphone },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "settings", label: "Settings", icon: Settings },
]

export function Sidebar({
  active,
  onSelect,
  brandName,
  onLogout,
}: {
  active: NavKey
  onSelect: (k: NavKey) => void
  brandName: string
  onLogout?: () => void
}) {
  return (
    // Sidebar lives on Espresso (--sidebar #1C1412). Inactive items use
    // sidebar-foreground at 70% opacity (clear off-white over espresso),
    // active items get the mint primary pill with espresso ink so the
    // selected page is unmistakable. Hex avatars + brand name promoted
    // to full-cream so they don't disappear on the espresso background.
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Coffee className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">Local Coffee Perks</div>
          <div className="text-[11px] text-sidebar-foreground/60">For the regulars</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {items.map((it) => {
            const Icon = it.icon
            const isActive = it.key === active
            return (
              <li key={it.key}>
                <button
                  onClick={() => onSelect(it.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 1.9} />
                  <span className="font-medium">{it.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
            {brandName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{brandName}</div>
            <div className="text-[11px] text-sidebar-foreground/55">Owner · Admin</div>
          </div>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.9} />
            <span className="font-medium">Sign out</span>
          </button>
        )}
      </div>
    </aside>
  )
}
