import { Coffee, Globe2 } from "lucide-react";

export const CustomerExperience = () => (
  <section className="bg-background py-24 sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">For your customers</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          Two ways to be a regular.
        </h2>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="reveal rounded-3xl border border-border bg-card p-8 shadow-soft sm:p-10">
          <Coffee className="text-mint mb-5 h-8 w-8" />
          <h3 className="font-display mb-3 text-2xl font-semibold">Private Card</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Loyal to one cafe? Collect stamps just for them. A clean, branded pass that lives in your phone — no more lost paper cards.
          </p>
        </div>
        <div className="reveal rounded-3xl border border-mint/40 bg-card p-8 shadow-soft sm:p-10" style={{ transitionDelay: "100ms" }}>
          <Globe2 className="text-mint mb-5 h-8 w-8" />
          <h3 className="font-display mb-3 text-2xl font-semibold">LCP+ Global Pass</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Travel often? Earn and redeem stamps across every LCP+ cafe — at home, in the next city, on the other side of the world.
          </p>
        </div>
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
