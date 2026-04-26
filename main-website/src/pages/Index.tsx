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

// Mobile (default): every tile is a uniform aspect-square in a
// 2-col grid → 4 flush rows of 2 = no awkward bottom gap.
// sm+ : the editorial masonry kicks in via sm:-prefixed spans
// against an auto-rows track.
const tiles: Tile[] = [
  { src: coffee1, alt: "Latte art on a flat white", className: "sm:col-span-2 sm:row-span-2", delay: "0s" },
  { src: coffee2, alt: "Independent café counter", className: "sm:col-span-2 sm:row-span-3", delay: "1.2s" },
  { src: coffee3, alt: "Coffee with pastry", className: "sm:col-span-2 sm:row-span-2", delay: "0.6s" },
  { src: coffee4, alt: "Espresso pull", className: "sm:col-span-2 sm:row-span-2", delay: "2s" },
  { src: coffee5, alt: "Cortado on a saucer", className: "sm:col-span-2 sm:row-span-2", delay: "0.3s" },
  { src: coffee6, alt: "Iced coffee in a tall glass", className: "sm:col-span-2 sm:row-span-3", delay: "1.6s" },
  { src: coffee7, alt: "Beans being weighed", className: "sm:col-span-2 sm:row-span-2", delay: "0.9s" },
  { src: coffee8, alt: "Morning coffee on a wooden table", className: "sm:col-span-2 sm:row-span-2", delay: "2.4s" },
];

const Index = () => {
  return (
    <main className="relative z-10 min-h-screen overflow-hidden">
      {/* Top bar */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 text-xs uppercase tracking-[0.2em] text-cream/70 sm:px-10">
        <div className="flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3 py-1.5 text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-dot-pulse" />
          <span className="font-semibold tracking-[0.22em]">Launching Spring 2026</span>
        </div>
        <div className="hidden sm:block">Built for local cafés</div>
      </header>

      {/* Brand block */}
      <section className="mx-auto max-w-4xl px-6 pt-16 text-center sm:pt-24">
        <div className="mb-8 flex justify-center animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-mint/40 bg-espresso/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-mint backdrop-blur-sm shadow-[0_0_20px_-4px_rgba(42,245,152,0.35)]">
            <span className="h-1.5 w-1.5 rounded-full bg-mint animate-dot-pulse" />
            Coming Soon · Spring 2026
          </span>
        </div>
        <h1 className="font-display text-[15vw] font-medium leading-[0.95] tracking-tight text-cream sm:text-7xl md:text-8xl lg:text-[112px] animate-fade-in">
          Local <span className="italic text-mint/90">Coffee</span> Perks
        </h1>
        <div className="mx-auto mt-6 flex items-center justify-center gap-4">
          <span className="h-px w-12 bg-mint/60" />
          <p className="font-display italic text-base text-cream/75 sm:text-lg">For the regulars.</p>
          <span className="h-px w-12 bg-mint/60" />
        </div>

        <h2 className="mx-auto mt-12 max-w-2xl font-display text-2xl leading-snug text-cream/90 sm:text-3xl md:text-4xl animate-fade-in">
          Something special is <em className="text-mint">brewing</em> at your favorite local cafe.
        </h2>
      </section>

      {/* Editorial collage */}
      <section className="mx-auto mt-14 max-w-7xl px-6 sm:mt-20 sm:px-10">
        <div className="grid grid-cols-2 gap-3 sm:auto-rows-[60px] sm:grid-cols-4 sm:gap-4 md:grid-cols-8 md:auto-rows-[72px]">
          {tiles.map((tile, i) => (
            <figure
              key={i}
              className={`group relative aspect-square overflow-hidden rounded-[20px] bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5 sm:aspect-auto ${tile.className}`}
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
          <a
            href="/waitlist/"
            onClick={(e) => {
              // Force a full-page navigation so nothing — service workers,
              // browser extensions, react-router internals, anything — can
              // intercept and SPA-trap the click. /waitlist/ is a separate
              // built app (main-website/dist/waitlist), not a route in
              // this React tree.
              e.preventDefault();
              window.location.href = "/waitlist/";
            }}
            className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-mint px-10 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground transition-transform duration-300 hover:scale-[1.04] active:scale-[0.98] animate-pulse-mint"
          >
            Join the Waitlist
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </a>
          <p className="max-w-md text-xs uppercase tracking-[0.22em] text-mint/80">
            Secure your <span className="text-mint">Founding 100</span> lifetime discount
          </p>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream/40">
            No payment · No commitment · Just be first to know
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
