import { Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWaitlistCounts } from "@/hooks/useWaitlistCounts";
import { cn } from "@/lib/utils";

export const UrgencyStrip = () => {
  const { counts, flash } = useWaitlistCounts();
  const total = counts.owner + counts.consumer;

  const scrollToForm = () =>
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="bg-espresso relative z-20 -mt-px border-y border-mint/20 text-white">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-5 sm:flex-row">
        <div className="flex items-center gap-3 text-sm sm:text-base">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint">
            <Flame
              className="h-4 w-4"
              style={{ animation: "scale-flash 2s ease-in-out infinite" }}
            />
          </span>
          <p className="text-balance">
            <span className="font-semibold text-mint">100 Founding spots open at launch.</span>{" "}
            <span className="text-white/75">
              Only waitlist members get the email first —{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums text-white",
                  (flash === "owner" || flash === "consumer") && "animate-scale-flash",
                )}
              >
                {total}
              </span>{" "}
              already on the list.
            </span>
          </p>
        </div>
        <Button
          onClick={scrollToForm}
          className="bg-mint text-accent-foreground hover:bg-mint/90 shadow-mint h-10 shrink-0 px-5 text-sm font-semibold"
        >
          Add me to the list
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
};
