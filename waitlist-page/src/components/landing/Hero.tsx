import { Button } from "@/components/ui/button";
import { HeroSlideshow } from "./HeroSlideshow";
import { LiveCounters } from "./LiveCounters";
import { ArrowDown } from "lucide-react";

export const Hero = () => {
  const scrollToForm = () => {
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden text-white">
      <HeroSlideshow />
      <div className="container relative z-10 mx-auto px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl space-y-7">
          <div className="animate-fade-in-up flex flex-col items-center gap-3">
            <div className="inline-flex flex-col items-center rounded-2xl border border-mint/50 bg-espresso/40 px-6 py-3 backdrop-blur-sm shadow-mint">
              <h1 className="font-display text-balance text-3xl font-semibold leading-none tracking-tight text-mint sm:text-4xl md:text-5xl">
                Local Coffee Perks
              </h1>
              <p className="font-display mt-1 text-sm italic tracking-wide text-white/80 sm:text-base">
                For the regulars.
              </p>
            </div>
          </div>
          <h2 className="font-display animate-fade-in-up text-balance text-4xl font-semibold leading-[1.05] text-white sm:text-5xl md:text-6xl" style={{ animationDelay: "120ms" }}>
            Turn first-timers into regulars. Without the paper card.
          </h2>
          <p className="mx-auto animate-fade-in-up max-w-2xl text-balance text-base leading-relaxed text-white/80 sm:text-lg" style={{ animationDelay: "240ms" }}>
            The exclusive loyalty network for independent coffee shops and small collectives. We strictly <span className="text-mint font-semibold">do not partner with corporate chains over 10 locations</span>. Let's keep the high street local.
          </p>

          <div className="flex animate-fade-in-up flex-col items-center gap-4 pt-2" style={{ animationDelay: "360ms" }}>
            <Button
              onClick={scrollToForm}
              size="lg"
              className="bg-mint text-accent-foreground shadow-mint hover:bg-mint/90 hover:shadow-mint h-12 px-7 text-base font-semibold"
            >
              Get on the list — 20 seconds
            </Button>
            <LiveCounters variant="hero" />
          </div>

          <p className="animate-fade-in-up pt-2 text-xs uppercase tracking-[0.2em] text-white/55" style={{ animationDelay: "500ms" }}>
            No payment · No commitment · Just be first to know
          </p>
        </div>
      </div>

      <button
        onClick={() => document.getElementById("why")?.scrollIntoView({ behavior: "smooth" })}
        aria-label="Scroll to learn more"
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 animate-float text-white/60 transition-colors hover:text-mint sm:block"
      >
        <ArrowDown className="h-5 w-5" />
      </button>
    </section>
  );
};
