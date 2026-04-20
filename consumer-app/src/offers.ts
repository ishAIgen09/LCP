import type { DiscoverOffer } from "./api";

const TARGET_LABELS: Record<DiscoverOffer["target"], string> = {
  any_drink: "any drink",
  all_pastries: "all pastries",
  food: "food",
  merchandise: "merchandise",
  entire_order: "your order",
};

export function formatOfferHeadline(o: DiscoverOffer): string {
  const target = TARGET_LABELS[o.target] ?? o.target;
  const amountNum = o.amount == null ? null : Number(o.amount);
  switch (o.offer_type) {
    case "percent":
      return `${amountNum ?? 0}% off ${target}`;
    case "fixed":
      return `${target} for £${(amountNum ?? 0).toFixed(2)}`;
    case "bogo":
      return `Buy one ${singularize(target)}, get one free`;
    case "double_stamps":
      return `Double stamps on ${target}`;
  }
}

function singularize(label: string): string {
  return label
    .replace(/^all\s+/i, "")
    .replace(/^any\s+/i, "")
    .replace(/^your\s+/i, "")
    .replace(/\s+\/.*$/, "")
    .toLowerCase();
}

export function formatOfferWindow(o: DiscoverOffer): string {
  const end = new Date(o.ends_at);
  const now = new Date();
  const sameDay =
    end.getFullYear() === now.getFullYear() &&
    end.getMonth() === now.getMonth() &&
    end.getDate() === now.getDate();
  const time = `${String(end.getHours()).padStart(2, "0")}:${String(
    end.getMinutes(),
  ).padStart(2, "0")}`;
  if (sameDay) return `Ends today · ${time}`;
  const date = end.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `Ends ${date} · ${time}`;
}
