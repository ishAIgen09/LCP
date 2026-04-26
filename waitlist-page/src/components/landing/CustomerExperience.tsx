import { Heart, Smartphone, Compass } from "lucide-react";

const benefits = [
  {
    icon: Heart,
    title: "Support your favorite independent cafes",
    body: "Every stamp keeps the corner cafe on the corner. Your morning coffee becomes a vote for the local high street, not the chain on every block.",
  },
  {
    icon: Smartphone,
    title: "Never lose a paper loyalty card again",
    body: "Your stamps live in the LCP app — safe in your pocket, always with you, never crumpled at the bottom of a bag or left in last winter's coat.",
  },
  {
    icon: Compass,
    title: "Discover new hidden gems in your area",
    body: "Get pinned to a map of indie cafes around you. Travel to a new city? Find your next great flat white before you've even unpacked.",
  },
];

export const CustomerExperience = () => (
  <section className="bg-background py-24 sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">For coffee lovers</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          For Coffee Lovers: Support Local, <span className="text-mint">Get Rewarded.</span>
        </h2>
        <p className="mt-5 text-muted-foreground">
          One free app. Every independent cafe you love. Stamps that follow you wherever you brew.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3">
        {benefits.map((b, i) => {
          const Icon = b.icon;
          return (
            <article
              key={b.title}
              className="reveal rounded-3xl border border-border bg-card p-8 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-mint/50 hover:shadow-elegant sm:p-10"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-espresso text-mint shadow-mint">
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="font-display mb-3 text-xl font-semibold leading-snug text-foreground">
                {b.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p>
            </article>
          );
        })}
      </div>

      <div className="reveal mx-auto mt-10 max-w-5xl rounded-3xl bg-espresso px-8 py-10 text-center text-white shadow-elegant sm:px-12">
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <div className="flex gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full border border-mint/60"
                style={{
                  backgroundColor: "hsl(var(--mint))",
                  animation: "fade-in-up 0.5s ease-out both",
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>
          <p className="font-display text-2xl">
            Buy 10, get the <span className="text-mint">11th free</span>
          </p>
        </div>
        <p className="mt-4 text-sm text-white/60">Always free for coffee lovers. No subscription, ever.</p>
      </div>
    </div>
  </section>
);
