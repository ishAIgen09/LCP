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
};

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
