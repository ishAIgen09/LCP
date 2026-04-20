// Offer types + ApiOffer → UI Offer coercion. Promotions are brand-scoped
// server-side (see app/models.py Offer) — the admin session's JWT carries
// the brand_id, so the API needs nothing extra from the client.

import type { ApiOffer } from "./api"

export const OFFER_TYPES = [
  { id: "percent",       label: "Percentage Discount %", amountKind: "percent" },
  { id: "fixed",         label: "Fixed Price £",          amountKind: "fixed"   },
  { id: "bogo",          label: "Buy One Get One",        amountKind: "none"    },
  { id: "double_stamps", label: "Double Stamps",          amountKind: "none"    },
] as const satisfies ReadonlyArray<{ id: string; label: string; amountKind: "percent" | "fixed" | "none" }>

export type OfferType = (typeof OFFER_TYPES)[number]["id"]
export type AmountKind = (typeof OFFER_TYPES)[number]["amountKind"]

export const OFFER_TARGETS = [
  { id: "any_drink",    label: "Any Drink" },
  { id: "all_pastries", label: "All Pastries" },
  { id: "food",         label: "Food / Sandwiches" },
  { id: "merchandise",  label: "Merchandise" },
  { id: "entire_order", label: "Entire Order" },
] as const satisfies ReadonlyArray<{ id: string; label: string }>

export type OfferTarget = (typeof OFFER_TARGETS)[number]["id"]

// The UI form keeps startDate + startTime as separate local strings; the API
// uses two ISO UTC timestamps. Keep both shapes and convert at the boundary.
export type Offer = {
  id: string
  type: OfferType
  target: OfferTarget
  amount: number | null
  startDate: string     // YYYY-MM-DD, local
  startTime: string     // HH:MM, 24h local
  endDate: string       // YYYY-MM-DD, local
  endTime: string       // HH:MM, 24h local
  // null = applies to every cafe under the brand ("All Locations").
  // string[] = scoped to those specific cafe ids.
  targetCafeIds: string[] | null
  createdAt: number     // epoch ms, sourced from ApiOffer.created_at
}

export function offerFromApi(a: ApiOffer): Offer {
  const starts = new Date(a.starts_at)
  const ends = new Date(a.ends_at)
  return {
    id: a.id,
    type: a.offer_type,
    target: a.target,
    amount: a.amount == null ? null : Number(a.amount),
    startDate: toLocalDate(starts),
    startTime: toLocalTime(starts),
    endDate: toLocalDate(ends),
    endTime: toLocalTime(ends),
    targetCafeIds: a.target_cafe_ids ?? null,
    createdAt: new Date(a.created_at).getTime(),
  }
}

// The backend expects ISO UTC. Build a Date from the user's local date+time
// (which respects their device's timezone) and serialize.
export function localDateTimeToISO(date: string, time: string): string | null {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  if (!y || !m || !d) return null
  const local = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
  if (Number.isNaN(local.getTime())) return null
  return local.toISOString()
}

function toLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toLocalTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
