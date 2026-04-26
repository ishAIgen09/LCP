import {
  Accessibility,
  Bone,
  Car,
  Coffee,
  Croissant,
  Laptop,
  Leaf,
  Milk,
  Moon,
  Toilet,
  type LucideIcon,
} from "lucide-react"

// Amenity catalogue. `id` is the stable key sent to the backend and returned
// on every cafe read (see GET /api/admin/cafes + GET /api/consumer/cafes) —
// don't change these without a migration because they live in
// cafes.amenities. `label` is UI-only.
export const AMENITIES = [
  { id: "specialty_beans",       label: "Specialty Beans",           Icon: Coffee },
  { id: "alternative_milks",     label: "Alternative Milks",         Icon: Milk },
  { id: "dog_friendly",          label: "Dog Friendly",              Icon: Bone },
  { id: "laptop_wifi",           label: "Laptop Friendly / Wi-Fi",   Icon: Laptop },
  { id: "fresh_pastries",        label: "Fresh Pastries / Food",     Icon: Croissant },
  { id: "wheelchair_accessible", label: "Wheelchair Accessible",     Icon: Accessibility },
  { id: "toilets",               label: "Toilets",                   Icon: Toilet },
  { id: "gluten_free_vegan",     label: "Gluten-Free & Vegan Options", Icon: Leaf },
  { id: "halal",                 label: "Halal",                     Icon: Moon },
  { id: "drive_thru",            label: "Drive-thru",                Icon: Car },
] as const satisfies ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }>

export type AmenityId = (typeof AMENITIES)[number]["id"]

const VALID_IDS: ReadonlySet<string> = new Set(AMENITIES.map((a) => a.id))

export function sanitizeAmenityIds(raw: readonly string[]): AmenityId[] {
  const seen = new Set<AmenityId>()
  for (const value of raw) {
    if (typeof value === "string" && VALID_IDS.has(value)) {
      seen.add(value as AmenityId)
    }
  }
  return [...seen]
}
