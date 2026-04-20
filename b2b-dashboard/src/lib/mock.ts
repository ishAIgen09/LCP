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
  plan: "Starter" | "Growth" | "Scale"
  planPrice: string
  subscriptionStatus: "active" | "trialing" | "past_due" | "canceled"
  createdAt: string
  currentPeriodEnd?: string | null
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
}

// The current owner's brand. In a real build this would come from the
// authenticated session, not a constant. The dashboard is scoped to this
// brand only — the owner cannot create or switch brands from the UI.
export const initialBrand: Brand = {
  name: "Halcyon Coffee Co.",
  slug: "halcyon-coffee",
  contactEmail: "owner@halcyoncoffee.co.uk",
  schemeType: "global",
  plan: "Growth",
  planPrice: "£5 / month per cafe",
  subscriptionStatus: "active",
  createdAt: "2026-04-02",
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
  },
]
