export type SchemeType = "global" | "private"

export type Session =
  | {
      role: "admin"
      token: string
      email: string
      brandId: string
      brandName: string
      schemeType: SchemeType
    }
  | {
      role: "store"
      token: string
      venueApiKey: string
      storeNumber: string
      cafeName: string
      brandName: string
    }

export type Brand = {
  name: string
  slug: string
  contactEmail: string
  schemeType: SchemeType
  // Plan label is derived from schemeType server-side mapping:
  //   private → "Private Scheme"        (£5 / mo per cafe)
  //   global  → "LCP+ Global Pass"      (£7.99 / mo per cafe)
  // The legacy "Starter" / "Growth" labels are gone — owners pick their
  // tier at signup and the dashboard mirrors that choice.
  plan: "Private Scheme" | "LCP+ Global Pass"
  planPrice: string
  subscriptionStatus:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "pending_cancellation"
  createdAt: string
  currentPeriodEnd?: string | null
  // True between Cancel Subscription click and current_period_end
  // expiry — backend mirrors Stripe's `cancel_at_period_end` flag
  // (migration 0021). Drives BillingView's Lame Duck warning banner.
  cancelAtPeriodEnd: boolean
  // KYC fields (nullable — filled in from Settings at the admin's pace).
  ownerFirstName: string | null
  ownerLastName: string | null
  ownerPhone: string | null
  companyLegalName: string | null
  companyAddress: string | null
  companyRegistrationNumber: string | null
}

export type FoodHygieneRating = "1" | "2" | "3" | "4" | "5" | "Awaiting Inspection"

export type Cafe = {
  id: string
  name: string
  address: string
  scansThisMonth: number
  status: "live" | "paused"
  amenities: string[]
  phone: string | null
  foodHygieneRating: FoodHygieneRating
  // Sequential 3-digit store ID allocated by the backend
  // (see _allocate_store_number). Nullable for legacy rows that pre-date
  // the allocator change; UI falls back to initials in that case.
  storeNumber: string | null
  // Per-cafe Pay It Forward / Suspended Coffee opt-in (PRD §4.5,
  // migration 0020). Toggled from SettingsView's Community Board card.
  // Defaults to false; explicit true means the cafe accepts donations
  // and the Barista POS shows the pool counter + Serve button.
  suspendedCoffeeEnabled: boolean
}

// The current owner's brand. In a real build this would come from the
// authenticated session, not a constant. The dashboard is scoped to this
// brand only — the owner cannot create or switch brands from the UI.
export const initialBrand: Brand = {
  name: "Halcyon Coffee Co.",
  slug: "halcyon-coffee",
  contactEmail: "owner@halcyoncoffee.co.uk",
  schemeType: "global",
  plan: "LCP+ Global Pass",
  planPrice: "£7.99 / month per cafe",
  subscriptionStatus: "active",
  createdAt: "2026-04-02",
  cancelAtPeriodEnd: false,
  ownerFirstName: null,
  ownerLastName: null,
  ownerPhone: null,
  companyLegalName: null,
  companyAddress: null,
  companyRegistrationNumber: null,
}

export const initialCafes: Cafe[] = [
  {
    id: "c-01",
    name: "Halcyon Coffee Co. — Shoreditch",
    address: "14 Rivington St, London EC2A 3DU",
    scansThisMonth: 1_842,
    status: "live",
    amenities: [],
    phone: null,
    foodHygieneRating: "Awaiting Inspection",
    storeNumber: null,
    suspendedCoffeeEnabled: false,
  },
  {
    id: "c-02",
    name: "Halcyon Coffee Co. — King's Cross",
    address: "3 Pancras Sq, London N1C 4AG",
    scansThisMonth: 2_214,
    status: "live",
    amenities: [],
    phone: null,
    foodHygieneRating: "Awaiting Inspection",
    storeNumber: null,
    suspendedCoffeeEnabled: false,
  },
  {
    id: "c-03",
    name: "Halcyon Coffee Co. — Peckham",
    address: "133 Rye Ln, London SE15 4BQ",
    scansThisMonth: 967,
    status: "live",
    amenities: [],
    phone: null,
    foodHygieneRating: "Awaiting Inspection",
    storeNumber: null,
    suspendedCoffeeEnabled: false,
  },
  {
    id: "c-04",
    name: "Halcyon Coffee Co. — Brighton Lanes",
    address: "22 Ship St, Brighton BN1 1AD",
    scansThisMonth: 534,
    status: "paused",
    amenities: [],
    phone: null,
    foodHygieneRating: "Awaiting Inspection",
    storeNumber: null,
    suspendedCoffeeEnabled: false,
  },
]
