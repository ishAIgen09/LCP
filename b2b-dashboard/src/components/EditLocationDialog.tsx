import { useEffect, useMemo, useState } from "react"
import { Check, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AMENITIES,
  sanitizeAmenityIds,
  type AmenityId,
} from "@/lib/amenities"
import {
  humanizeError,
  updateCafe,
  updateCafeAmenities,
} from "@/lib/api"
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput"
import type { Cafe, FoodHygieneRating } from "@/lib/mock"
import { cn } from "@/lib/utils"

const HYGIENE_OPTIONS: FoodHygieneRating[] = [
  "5",
  "4",
  "3",
  "2",
  "1",
  "Awaiting Inspection",
]

const FSA_LABEL: Record<Exclude<FoodHygieneRating, "Awaiting Inspection">, string> = {
  "5": "Very Good",
  "4": "Good",
  "3": "Generally Satisfactory",
  "2": "Improvement Necessary",
  "1": "Major Improvement Necessary",
}

export function EditLocationDialog({
  open,
  onOpenChange,
  token,
  cafe,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  token: string
  cafe: Cafe | null
  onSaved: () => void | Promise<void>
}) {
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [rating, setRating] = useState<FoodHygieneRating>("Awaiting Inspection")
  const [amenities, setAmenities] = useState<Set<AmenityId>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed form every time the dialog opens so changes from another session
  // / another admin are reflected, and so discarding an edit doesn't leak
  // into the next one.
  useEffect(() => {
    if (!open || !cafe) return
    setAddress(cafe.address)
    setPhone(cafe.phone ?? "")
    setRating(cafe.foodHygieneRating)
    setAmenities(new Set(sanitizeAmenityIds(cafe.amenities)))
    setError(null)
  }, [open, cafe])

  const originalAmenities = useMemo(
    () => new Set(sanitizeAmenityIds(cafe?.amenities ?? [])),
    [cafe],
  )
  const amenitiesDirty = useMemo(() => {
    if (originalAmenities.size !== amenities.size) return true
    for (const id of amenities) if (!originalAmenities.has(id)) return true
    return false
  }, [originalAmenities, amenities])

  const toggle = (id: AmenityId) => {
    setAmenities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSave = async () => {
    if (!cafe) return
    setSaving(true)
    setError(null)
    try {
      const trimmedAddress = address.trim()
      const trimmedPhone = phone.trim()
      const patch: Parameters<typeof updateCafe>[2] = {}
      if (trimmedAddress && trimmedAddress !== cafe.address) {
        patch.address = trimmedAddress
      }
      if ((cafe.phone ?? "") !== trimmedPhone) {
        patch.phone = trimmedPhone ? trimmedPhone : null
      }
      if (rating !== cafe.foodHygieneRating) {
        patch.food_hygiene_rating = rating
      }

      if (Object.keys(patch).length > 0) {
        await updateCafe(token, cafe.id, patch)
      }
      if (amenitiesDirty) {
        await updateCafeAmenities(token, cafe.id, [...amenities])
      }
      await onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(humanizeError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-tight">
            Edit · {cafe?.name ?? "location"}
          </DialogTitle>
          <DialogDescription>
            Update contact, hygiene rating, and amenities. Changes propagate to
            the consumer Discover feed immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">
              Address
            </label>
            <AddressAutocompleteInput
              token={token}
              value={address}
              onChange={setAddress}
              disabled={saving}
              placeholder="Search a new address…"
            />
            <p className="text-[11px] text-muted-foreground">
              Pick a suggestion to lock in a clean, geocoded address.
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">
              Phone number
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="020 7946 0958"
              autoComplete="tel"
              className="h-10"
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              Blank is fine — we'll hide the Phone row in the consumer app.
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">
              Food Hygiene Rating
            </label>
            <Select
              value={rating}
              onValueChange={(v) => setRating(v as FoodHygieneRating)}
              disabled={saving}
            >
              <SelectTrigger className="h-10">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {HYGIENE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt === "Awaiting Inspection"
                      ? opt
                      : `${opt} — ${FSA_LABEL[opt]}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[12px] font-medium text-foreground">
                Amenities
              </label>
              <span className="text-[11px] text-muted-foreground">
                {amenities.size} of {AMENITIES.length} selected
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {AMENITIES.map(({ id, label, Icon }) => {
                const checked = amenities.has(id)
                return (
                  <label
                    key={id}
                    htmlFor={`edit-loc-amenity-${id}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors",
                      checked
                        ? "border-foreground/40 bg-muted/60"
                        : "border-border bg-background hover:bg-muted/30",
                      saving && "pointer-events-none opacity-60",
                    )}
                  >
                    <input
                      id={`edit-loc-amenity-${id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      disabled={saving}
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
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground">
                      {label}
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
                )
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !cafe} className="gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
