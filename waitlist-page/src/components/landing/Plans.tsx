import { Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Private Plan",
    tagline: "Just your cafe. Just your customers.",
    description: "Your own branded loyalty card. Customers earn stamps with you, redeem free coffees with you. Simple.",
    bestFor: "Best for: cafes who want a clean, branded card and own their customer relationships.",
    founding: "£5",
    standard: "£10",
    features: [
      "Your own isolated digital loyalty card",
      "Customers scan your custom QR code",
      "Stop paper card fraud instantly",
      "Track daily stamps and redemptions",
      "Attract brand-new customers using the LCP App",
    ],
  },
  {
    name: "LCP+ Global Pass",
    tagline: "Get discovered by coffee lovers nearby.",
    description: "Everything in the Private plan, plus you join a network of independent cafes. New customers find you in the app, earn stamps with you, and come back.",
    bestFor: "Best for: cafes who want fresh footfall from people already searching for indie coffee in your area.",
    founding: "£7.99",
    standard: "£12.99",
    highlighted: true,
    features: [
      "Everything in the Private plan, plus:",
      "Join the shared worldwide network",
      "Cross-cafe stamps: customers earn perks across the network",
      "Get pinned on the LCP+ in-app discovery map",
      "Featured to coffee lovers travelling through your area",
    ],
  },
];

export const Plans = () => (
  <section id="plans" className="bg-background py-24 sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">For cafe owners</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          Pick the plan that fits. Both up to 50% off for the first 100 cafes.
        </h2>
        <p className="mt-5 text-muted-foreground">
          When we launch, the first 100 cafes to sign up lock in this Founding price <span className="font-semibold text-foreground">for life</span>. After that, prices go to standard. The waitlist is your head start.
        </p>
      </div>

      <div className="reveal mx-auto mt-8 flex max-w-xl items-center justify-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-5 py-2.5 text-sm">
        <Flame className="h-4 w-4 text-mint" style={{ animation: "scale-flash 2s ease-in-out infinite" }} />
        <span className="font-medium">100 Founding spots · only at launch · half-price forever</span>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-2">
        {plans.map((plan, i) => (
          <div
            key={plan.name}
            className={cn(
              "reveal group relative overflow-hidden rounded-3xl border bg-card p-8 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:shadow-elegant sm:p-10",
              plan.highlighted ? "border-mint/60 ring-1 ring-mint/30" : "border-border",
            )}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            {plan.highlighted && (
              <div className="absolute right-6 top-6 rounded-full bg-mint px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                Most popular
              </div>
            )}
            <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm font-medium text-mint">{plan.tagline}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>

            <div className="mt-7 rounded-2xl border border-mint/30 bg-mint/5 p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-mint">
                <Flame className="h-3.5 w-3.5" />
                Founding 100 price
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-display text-5xl font-semibold text-foreground" style={{ animation: "scale-flash 3s ease-in-out infinite", animationDelay: `${i * 400}ms` }}>
                  {plan.founding}
                </span>
                <span className="text-sm text-muted-foreground">/ month, locked in for life</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Standard price after the first 100: <span className="font-semibold text-foreground line-through decoration-muted-foreground/60">{plan.standard}/mo</span> — that's a <span className="font-semibold text-mint">{plan.name === "Private Plan" ? "50%" : "38%"} saving, every month, forever</span>.
              </p>
            </div>

            <div className="my-7 h-px bg-border" />

            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">What you get</p>
            <ul className="space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs italic text-muted-foreground">{plan.bestFor}</p>
          </div>
        ))}
      </div>

      <p className="reveal mt-10 text-center text-sm text-muted-foreground">
        Always free for coffee lovers. No subscription, no hidden fees — ever.
      </p>
    </div>
  </section>
);
