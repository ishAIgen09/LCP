import { Coffee, Heart } from "lucide-react";
import { useWaitlistCounts } from "@/hooks/useWaitlistCounts";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "hero" | "default";
}

export const LiveCounters = ({ variant = "default" }: Props) => {
  const { counts, flash } = useWaitlistCounts();
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
        <span
          className={cn(
            "tabular-nums font-semibold",
            flash === "owner" && "animate-scale-flash",
          )}
        >
          {counts.owner}
        </span>
        <span className="opacity-80">cafes interested</span>
      </span>
      <span className="h-4 w-px bg-current opacity-20" />
      <span className="flex items-center gap-2 text-sm">
        <Heart className="h-4 w-4 text-mint" />
        <span
          className={cn(
            "tabular-nums font-semibold",
            flash === "consumer" && "animate-scale-flash",
          )}
        >
          {counts.consumer}
        </span>
        <span className="opacity-80">coffee lovers waiting</span>
      </span>
    </div>
  );
};
