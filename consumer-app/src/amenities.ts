import {
  Accessibility,
  Bone,
  Car,
  Coffee,
  Croissant,
  Laptop,
  Leaf,
  Milk,
  Toilet,
  type LucideIcon,
} from "lucide-react-native";

// Consumer-side mirror of b2b-dashboard/src/lib/amenities.ts — same stable
// `id` strings, same labels, same lucide icons so the two surfaces feel
// like the same product. Keep in sync when adding new amenities.

export type AmenityDef = {
  id: string;
  label: string;
  Icon: LucideIcon;
};

export const AMENITIES: readonly AmenityDef[] = [
  { id: "specialty_beans",       label: "Specialty Beans",         Icon: Coffee },
  { id: "alternative_milks",     label: "Alternative Milks",       Icon: Milk },
  { id: "dog_friendly",          label: "Dog Friendly",            Icon: Bone },
  { id: "laptop_wifi",           label: "Laptop / Wi-Fi",          Icon: Laptop },
  { id: "fresh_pastries",        label: "Fresh Pastries",          Icon: Croissant },
  { id: "wheelchair_accessible", label: "Wheelchair Access",       Icon: Accessibility },
  { id: "toilets",               label: "Toilets",                 Icon: Toilet },
  { id: "gluten_free_vegan",     label: "Gluten-Free & Vegan",     Icon: Leaf },
  { id: "drive_thru",            label: "Drive-thru",              Icon: Car },
];

const BY_ID = new Map(AMENITIES.map((a) => [a.id, a]));

export function lookupAmenity(id: string): AmenityDef | undefined {
  return BY_ID.get(id);
}
