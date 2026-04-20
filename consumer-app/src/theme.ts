export const COLOR = {
  bg: "#0B0908",
  surface: "#15120F",
  surfaceElevated: "#1C1815",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#FAF7F2",
  textMuted: "#A8A29E",
  textDim: "#78716C",
  textFaint: "#57534E",
  accent: "#E4B97F",
  accentDeep: "#C99A58",
  accentInk: "#0B0908",
  live: "#4ADE80",
  // Brand moodboard palette (see brand-moodboard.html). The dark app uses
  // espresso as its `bg` and crema as `text`; terracotta + oat + moss are
  // reserved for warm accent surfaces (cafe detail promo panel, etc.).
  espresso: "#2A211C",
  crema: "#FBF7F1",
  oat: "#F3E9DC",
  terracotta: "#C96E4B",
  terracottaInk: "#FBF7F1",
  roastedAlmond: "#C8AA8D",
  moss: "#5E6B4E",
};

// Inter font family — loaded in App.tsx via @expo-google-fonts/inter. The
// strings match the module's exported names exactly; get them wrong and RN
// falls back to the system font silently.
export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type Consumer = {
  consumer_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type Session = {
  token: string;
  consumer: Consumer;
};
