import { Coffee, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "hero" | "default";
}

// Pre-launch we don't have an honest live count to show, so the two
// "live" slots carry static, on-brand copy instead — "100 Founding spots"
// (the actual scarcity number) and "Join the local movement" (the
// invitation). The Live dot + icons are kept so the visual rhythm of
// the pill is preserved; the dynamic count animation hooks were
// removed alongside useWaitlistCounts since neither slot is numeric
// any more.
export const LiveCounters = ({ variant = "default" }: Props) => {
  const dark = variant === "hero";

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-3 rounded-full border px-4 py-2 backdrop-blur-md",
        dark
          ? "border-white/15 bg-white/5 text-white"
          : "border-border bg-card text-foreground shadow-soft",
      )}
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-mint opacity-80" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
        </span>
        <span className="text-xs font-medium uppercase tracking-wider opacity-80">Live</span>
      </span>
      <span className="h-4 w-px bg-current opacity-20" />
      <span className="flex items-center gap-2 text-sm">
        <Coffee className="h-4 w-4 text-mint" />
        <span className="font-semibold">100 Founding spots</span>
      </span>
      <span className="h-4 w-px bg-current opacity-20" />
      <span className="flex items-center gap-2 text-sm">
        <Heart className="h-4 w-4 text-mint" />
        <span className="font-semibold">Join the local movement</span>
      </span>
    </div>
  );
};
