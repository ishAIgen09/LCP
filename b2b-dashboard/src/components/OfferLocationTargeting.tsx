import { Check, MapPin } from "lucide-react"
import type { Cafe } from "@/lib/mock"
import { cn } from "@/lib/utils"

// Serialized shape (matches the API + DB):
//   null       → "All Locations" (every cafe under the brand)
//   string[]   → "Specific Locations" (even if empty — user has chosen the
//                specific-locations mode but hasn't ticked any yet)
export type OfferLocationTargetingValue = string[] | null

export function OfferLocationTargeting({
  cafes,
  value,
  onChange,
  disabled,
}: {
  cafes: Cafe[]
  value: OfferLocationTargetingValue
  onChange: (next: OfferLocationTargetingValue) => void
  disabled?: boolean
}) {
  const mode: "all" | "specific" = value === null ? "all" : "specific"
  const selected = new Set(value ?? [])

  const toggleCafe = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <ModeCard
          active={mode === "all"}
          title="All locations"
          subtitle={`Applies to every cafe (${cafes.length})`}
          onSelect={() => onChange(null)}
          disabled={disabled}
        />
        <ModeCard
          active={mode === "specific"}
          title="Specific locations"
          subtitle="Pick which cafes see this offer"
          onSelect={() => onChange(value ?? [])}
          disabled={disabled}
        />
      </div>

      {mode === "specific" && (
        <div className="rounded-md border border-border bg-background p-2">
          {cafes.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
              No locations yet. Add one in the Locations tab first.
            </p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {cafes.map((c) => {
                const checked = selected.has(c.id)
                return (
                  <li key={c.id}>
                    <label
                      htmlFor={`offer-cafe-${c.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors",
                        checked
                          ? "border-foreground/40 bg-muted/60"
                          : "border-border bg-background hover:bg-muted/30",
                        disabled && "pointer-events-none opacity-60",
                      )}
                    >
                      <input
                        id={`offer-cafe-${c.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCafe(c.id)}
                        disabled={disabled}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                          checked
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-snug text-foreground">
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                          checked
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-transparent",
                        )}
                        aria-hidden
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {cafes.length > 0 && (
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">
              {selected.size} of {cafes.length} selected
              {selected.size === 0 && " — offer won't be visible until at least one is ticked."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ModeCard({
  active,
  title,
  subtitle,
  onSelect,
  disabled,
}: {
  active: boolean
  title: string
  subtitle: string
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-foreground/50 bg-muted/60"
          : "border-border bg-background hover:bg-muted/30",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
          active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-transparent",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-background" : "bg-transparent",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-medium text-foreground">
          {title}
        </span>
        <span className="block text-[11.5px] text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  )
}
