import { useToast } from "@/hooks/use-toast";
import coffee1 from "@/assets/coffee-1.jpeg";
import coffee2 from "@/assets/coffee-2.jpeg";
import coffee3 from "@/assets/coffee-3.jpeg";
import coffee4 from "@/assets/coffee-4.jpeg";
import coffee5 from "@/assets/coffee-5.jpeg";
import coffee6 from "@/assets/coffee-6.jpeg";
import coffee7 from "@/assets/coffee-7.jpeg";
import coffee8 from "@/assets/coffee-8.jpeg";

type Tile = {
  src: string;
  alt: string;
  className: string;
  delay: string;
};

const tiles: Tile[] = [
  { src: coffee1, alt: "Latte art on a flat white", className: "col-span-2 row-span-2", delay: "0s" },
  { src: coffee2, alt: "Independent café counter", className: "col-span-2 row-span-3", delay: "1.2s" },
  { src: coffee3, alt: "Coffee with pastry", className: "col-span-2 row-span-2", delay: "0.6s" },
  { src: coffee4, alt: "Espresso pull", className: "col-span-2 row-span-2", delay: "2s" },
  { src: coffee5, alt: "Cortado on a saucer", className: "col-span-2 row-span-2", delay: "0.3s" },
  { src: coffee6, alt: "Iced coffee in a tall glass", className: "col-span-2 row-span-3", delay: "1.6s" },
  { src: coffee7, alt: "Beans being weighed", className: "col-span-2 row-span-2", delay: "0.9s" },
  { src: coffee8, alt: "Morning coffee on a wooden table", className: "col-span-2 row-span-2", delay: "2.4s" },
];

const Index = () => {
  const { toast } = useToast();

  const handleWaitlist = () => {
    toast({
      title: "You're nearly on the list ☕",
      description: "Waitlist sign-up opens soon. We'll save you a seat at the counter.",
    });
  };

  return (
    <main className="relative z-10 min-h-screen overflow-hidden">
      {/* Top bar */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 text-xs uppercase tracking-[0.2em] text-cream/60 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-dot-pulse" />
          <span>Coming soon · 2026</span>
        </div>
        <div className="hidden sm:block">Independent cafés · UK</div>
      </header>

      {/* Brand block */}
      <section className="mx-auto max-w-4xl px-6 pt-16 text-center sm:pt-24">
        <h1 className="font-display text-[15vw] font-medium leading-[0.95] tracking-tight text-cream sm:text-7xl md:text-8xl lg:text-[112px] animate-fade-in">
          Local <span className="italic text-mint/90">Coffee</span> Perks
        </h1>
        <div className="mx-auto mt-6 flex items-center justify-center gap-4">
          <span className="h-px w-12 bg-mint/60" />
          <p className="font-display italic text-base text-cream/75 sm:text-lg">For the regulars.</p>
          <span className="h-px w-12 bg-mint/60" />
        </div>

        <h2 className="mx-auto mt-12 max-w-2xl font-display text-2xl leading-snug text-cream/90 sm:text-3xl md:text-4xl animate-fade-in">
          Something special is <em className="text-mint">brewing</em> on your local high street.
        </h2>
      </section>

      {/* Editorial collage */}
      <section className="mx-auto mt-14 max-w-7xl px-6 sm:mt-20 sm:px-10">
        <div className="grid auto-rows-[44px] grid-cols-4 gap-3 sm:auto-rows-[60px] sm:gap-4 md:grid-cols-8 md:auto-rows-[72px]">
          {tiles.map((tile, i) => (
            <figure
              key={i}
              className={`group relative overflow-hidden rounded-[20px] bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5 ${tile.className}`}
              style={{ animation: `float-soft 7s ease-in-out ${tile.delay} infinite` }}
            >
              <img
                src={tile.src}
                alt={tile.alt}
                loading={i < 3 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/40 via-transparent to-transparent" />
            </figure>
          ))}
        </div>
      </section>

      {/* Sub-headline + CTA */}
      <section className="mx-auto max-w-2xl px-6 py-20 text-center sm:py-28">
        <p className="font-display text-lg leading-relaxed text-cream/80 sm:text-xl">
          The ultimate loyalty network for independent cafés and their regulars.
          <br className="hidden sm:block" />
          <span className="text-cream/60"> No corporate chains. No paper cards.</span>
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <button
            onClick={handleWaitlist}
            className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-mint px-10 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground transition-transform duration-300 hover:scale-[1.04] active:scale-[0.98] animate-pulse-mint"
          >
            Join the Waitlist
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
          <p className="text-xs uppercase tracking-[0.22em] text-cream/45">
            Be first to brew with us at launch
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl px-6 pb-10 text-center text-xs uppercase tracking-[0.25em] text-cream/40 sm:px-10">
        <span className="font-display normal-case italic tracking-normal text-cream/60">Local Coffee Perks.</span>
        <span className="mx-2">·</span>
        Keep the high street local.
      </footer>
    </main>
  );
};

export default Index;
