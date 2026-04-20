import { useMemo, useRef, useState } from "react"
import {
  Check,
  CreditCard,
  Info,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
} from "lucide-react"
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
import { humanizeError } from "@/lib/api"
import { AMENITIES, type AmenityId } from "@/lib/amenities"
import { cn } from "@/lib/utils"
import type { Brand, FoodHygieneRating } from "@/lib/mock"

// Dropdown options — order as per PRD (highest to lowest, then the pre-audit
// pending state). Mirrors the backend CHECK constraint in migration 0007
// and the pydantic Literal in app/schemas.py.
const HYGIENE_OPTIONS: FoodHygieneRating[] = [
  "5",
  "4",
  "3",
  "2",
  "1",
  "Awaiting Inspection",
]

// Official FSA text labels for the 1–5 band. Rendered in the dropdown option
// alongside the numeric value so merchants can self-verify they're picking the
// right rating; consumer app's FoodHygieneBadge uses the same labels.
const FSA_LABEL: Record<Exclude<FoodHygieneRating, "Awaiting Inspection">, string> = {
  "5": "Very Good",
  "4": "Good",
  "3": "Generally Satisfactory",
  "2": "Improvement Necessary",
  "1": "Major Improvement Necessary",
}

// Mock address corpus — a Places autocomplete stand-in until we wire a real
// geocoding API (Google Places / Mapbox / Ordnance Survey). Filter is a plain
// case-insensitive substring match — good enough to demonstrate the UX.
const MOCK_ADDRESSES: string[] = [
  "14 Rivington St, London EC2A 3DU",
  "22 Redchurch St, London E2 7DP",
  "45 Caledonian Rd, London N1 9DX",
  "88 Rye Lane, London SE15 5BS",
  "5 Brighton Lanes, Brighton BN1 1HB",
  "110 Hackney Rd, London E2 7QL",
  "3 Broadway Market, London E8 4QJ",
  "27 Bold St, Liverpool L1 4DN",
  "12 Thomas St, Manchester M4 1FU",
  "9 Grassmarket, Edinburgh EH1 2HY",
]

export function AddLocationDialog({
  open,
  onOpenChange,
  brand,
  onSubmit,
  onOpenPortal,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand: Brand
  onSubmit: (values: {
    name: string
    address: string
    phone?: string | null
    food_hygiene_rating: FoodHygieneRating
    amenityIds: string[]
  }) => Promise<string>
  // Called when the user clicks "Need to use a different card?" inside the
  // per-cafe billing warning block. Parent (App.tsx) owns the API call and
  // the window.location redirect so the dialog stays API-free.
  onOpenPortal: () => Promise<void>
}) {
  const [name, setName] = useState("")

  // Address state: two modes — "search" (autocomplete) and "manual" (three
  // structured inputs). Both converge on a single string passed to the API.
  const [mode, setMode] = useState<"search" | "manual">("search")
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [picked, setPicked] = useState<string | null>(null) // the selected suggestion
  const [line1, setLine1] = useState("")
  const [city, setCity] = useState("")
  const [postcode, setPostcode] = useState("")

  const [phone, setPhone] = useState("")
  const [foodHygieneRating, setFoodHygieneRating] =
    useState<FoodHygieneRating>("Awaiting Inspection")
  const [amenities, setAmenities] = useState<Set<AmenityId>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)

  const openPortal = async () => {
    if (submitting || openingPortal) return
    setError(null)
    setOpeningPortal(true)
    try {
      await onOpenPortal()
      // onOpenPortal triggers a full-page redirect. If we return, it failed —
      // fall through to the finally block so the link re-enables.
    } catch (e) {
      setError(humanizeError(e))
    } finally {
      setOpeningPortal(false)
    }
  }

  const searchWrapRef = useRef<HTMLDivElement | null>(null)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return MOCK_ADDRESSES.filter((a) => a.toLowerCase().includes(q)).slice(0, 5)
  }, [query])

  // Final address string sent to the backend. Either the picked suggestion,
  // the free-typed query, or the joined manual parts — whichever mode is
  // active. Manual wins if the user switched to it and filled fields.
  const resolvedAddress = useMemo(() => {
    if (mode === "manual") {
      return [line1, city, postcode]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ")
    }
    return (picked ?? query).trim()
  }, [mode, line1, city, postcode, picked, query])

  const nameValid = name.trim().length > 1
  const addressValid = resolvedAddress.length > 3
  const valid = nameValid && addressValid

  const reset = () => {
    setName("")
    setMode("search")
    setQuery("")
    setPicked(null)
    setLine1("")
    setCity("")
    setPostcode("")
    setPhone("")
    setFoodHygieneRating("Awaiting Inspection")
    setAmenities(new Set())
    setError(null)
    setSubmitting(false)
  }

  const toggleAmenity = (id: AmenityId) => {
    setAmenities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pickSuggestion = (addr: string) => {
    setPicked(addr)
    setQuery(addr)
    setFocused(false)
  }

  const submit = async () => {
    if (!valid || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const trimmedPhone = phone.trim()
      await onSubmit({
        name: name.trim(),
        address: resolvedAddress,
        phone: trimmedPhone ? trimmedPhone : null,
        food_hygiene_rating: foodHygieneRating,
        amenityIds: [...amenities],
      })
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (submitting) return
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-tight">Add a new location</DialogTitle>
          <DialogDescription>
            Register a new physical branch under{" "}
            <span className="font-medium text-foreground">{brand.name}</span>. It inherits your
            brand's subscription and{" "}
            <span className="font-medium text-foreground">
              {brand.schemeType === "global" ? "Global Open Network" : "Private Chain"}
            </span>{" "}
            loyalty scheme.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Branch name */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Branch name</label>
            <Input
              placeholder="e.g. Shoreditch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              autoFocus
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Stored as <span className="font-mono">{brand.name} — {name.trim() || "…"}</span>
            </p>
          </div>

          {/* Address — autocomplete / manual */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Address</label>

            {mode === "search" ? (
              <div ref={searchWrapRef} className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={2}
                />
                <Input
                  placeholder="Start typing address..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setPicked(null)
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => {
                    // Delay so a click on a suggestion can register.
                    window.setTimeout(() => setFocused(false), 150)
                  }}
                  className="h-10 pl-9"
                  disabled={submitting}
                />

                {focused && suggestions.length > 0 && (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-xl border border-border bg-popover shadow-lg ring-1 ring-foreground/5"
                  >
                    {suggestions.map((addr) => (
                      <li key={addr}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(addr)}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted"
                        >
                          <MapPin
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            strokeWidth={2}
                          />
                          <span className="text-foreground">
                            {highlightMatch(addr, query)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {focused && query.trim().length > 0 && suggestions.length === 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 rounded-xl border border-border bg-popover px-3 py-2.5 text-[12px] text-muted-foreground shadow-lg">
                    No matches. Keep typing, or
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setMode("manual")}
                      className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      enter manually
                    </button>
                    .
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                <Input
                  placeholder="Address line 1"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  className="h-10"
                  disabled={submitting}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-10"
                    disabled={submitting}
                  />
                  <Input
                    placeholder="Postcode"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                    className="h-10 font-mono tracking-wider"
                    disabled={submitting}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {mode === "search"
                  ? "Select a suggestion or type it out in full."
                  : "Free-form entry. We'll combine these into one line for the listing."}
              </p>
              <button
                type="button"
                onClick={() => setMode(mode === "search" ? "manual" : "search")}
                className="text-[11.5px] font-medium text-primary underline-offset-4 hover:underline"
              >
                {mode === "search" ? "Enter manually" : "Back to search"}
              </button>
            </div>
          </div>

          {/* Phone */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Phone number</label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2}
              />
              <Input
                type="tel"
                placeholder="020 7946 0958"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 pl-9"
                autoComplete="tel"
                disabled={submitting}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Shown to regulars inside the consumer app so they can ring ahead.
            </p>
          </div>

          {/* Food Hygiene Rating — UK FSA. Rendered as the iconic sticker on
              the consumer app's Contact & Location screen. */}
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">
              Food Hygiene Rating
            </label>
            <Select
              value={foodHygieneRating}
              onValueChange={(v) => setFoodHygieneRating(v as FoodHygieneRating)}
              disabled={submitting}
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
                    {opt === "Awaiting Inspection" ? opt : `${opt} — ${FSA_LABEL[opt]}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The FSA's Food Hygiene Rating Scheme score. Pick "Awaiting
              Inspection" until you've had your first audit.
            </p>
          </div>

          {/* Amenities */}
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[12px] font-medium text-foreground">
                Amenities for this location
              </label>
              <span className="text-[11px] text-muted-foreground">
                {amenities.size} of {AMENITIES.length} selected
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Location-specific. These populate the consumer Discover filters — pick only what
              this branch actually offers.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {AMENITIES.map(({ id, label, Icon }) => {
                const checked = amenities.has(id)
                return (
                  <label
                    key={id}
                    htmlFor={`add-loc-amenity-${id}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors",
                      checked
                        ? "border-foreground/40 bg-muted/60"
                        : "border-border bg-background hover:bg-muted/30",
                      submitting && "pointer-events-none opacity-60"
                    )}
                  >
                    <input
                      id={`add-loc-amenity-${id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAmenity(id)}
                      disabled={submitting}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                        checked
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground"
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
                          : "border-border bg-background text-transparent"
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

          {/* Per-cafe billing notice — only active brands get auto-charged
              on add. Inactive brands go through Stripe Checkout after the
              create, so the £5 is disclosed there instead. */}
          {brand.subscriptionStatus === "active" && (
            <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2.5">
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                  strokeWidth={2.25}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[12.5px] leading-snug text-amber-900">
                    Adding this location will automatically increase your plan
                    by{" "}
                    <span className="font-semibold">£5/month</span>. This will
                    be billed to your default payment method.
                  </p>
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={submitting || openingPortal}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber-900 underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-60",
                    )}
                  >
                    {openingPortal ? (
                      <>
                        <Loader2
                          className="h-3 w-3 animate-spin"
                          strokeWidth={2.25}
                        />
                        Opening Stripe portal…
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-3 w-3" strokeWidth={2.25} />
                        Need to use a different card? Update your billing
                        details here.
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

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
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button disabled={!valid || submitting} onClick={submit} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                {brand.subscriptionStatus === "active" ? "Saving…" : "Redirecting…"}
              </>
            ) : brand.subscriptionStatus === "active" ? (
              "Add location"
            ) : (
              "Add & Continue to Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Bold the typed query inside the suggestion line so the match is scannable.
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}
