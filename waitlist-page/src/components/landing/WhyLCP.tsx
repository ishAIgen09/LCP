import { BarChart3, Users, ShieldCheck, Smartphone, Zap, MapPin } from "lucide-react";

const pillars = [
  { icon: ShieldCheck, title: "Fraud-Proof Stamps", body: "Say goodbye to fake paper stamps and friendly-barista double punching. Every stamp is digitally verified and time-stamped in your backend." },
  { icon: Smartphone, title: "Zero Hardware Costs", body: "No new kit, no expensive setup. Just open our web portal on any smartphone, tablet, or till browser and scan the customer's unique QR code to stamp them in." },
  { icon: BarChart3, title: "Real-Time Dashboard", body: "Stop guessing. Log into your simple dashboard to see exactly how many stamps were earned and how many free coffees were redeemed today." },
  { icon: Zap, title: "Lightning Fast Checkout", body: "Keep your queue moving. Your barista scans the customer's QR code and the stamp lands instantly. (Includes a manual Till Code fallback!)." },
  { icon: Users, title: "Beat 'App Fatigue'", body: "Customers hate downloading a new app for every single coffee shop. Give them a dedicated, private loyalty card inside our universal digital wallet." },
  { icon: MapPin, title: "Get Discovered on the Map", body: "Join the LCP+ Global Network and get pinned on our in-app discovery map. Coffee lovers in your city will find you instantly." },
];

export const WhyLCP = () => (
  <section id="why" className="bg-cream py-24 sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">Why Local Coffee Perks</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          Built for the cafe on the corner — not the chain on every street.
        </h2>
        <p className="mt-5 text-muted-foreground">
          Paper stamp cards get lost. Big chains buy loyalty with discounts you can't match. We built something simpler — and on your side.
        </p>
      </div>
      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p, i) => {
          const Icon = p.icon;
          return (
            <article
              key={p.title}
              className="group relative flex flex-col rounded-2xl border border-border bg-card p-7 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-mint/50 hover:shadow-elegant"
            >
              <div className="absolute right-6 top-6 font-display text-xs text-muted-foreground/60 tabular-nums">
                0{i + 1}
              </div>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-espresso text-mint shadow-mint transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="font-display mb-2 text-xl font-semibold leading-snug text-foreground">
                {p.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <div className="mt-5 h-px w-10 bg-mint/60 transition-all duration-300 group-hover:w-20" />
            </article>
          );
        })}
      </div>
    </div>
  </section>
);
