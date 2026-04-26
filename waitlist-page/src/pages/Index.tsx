import { useReveal } from "@/hooks/useReveal";
import { Hero } from "@/components/landing/Hero";
import { UrgencyStrip } from "@/components/landing/UrgencyStrip";
import { WhyLCP } from "@/components/landing/WhyLCP";
import { Plans } from "@/components/landing/Plans";
import { ProductGlimpse } from "@/components/landing/ProductGlimpse";
import { Founding100 } from "@/components/landing/Founding100";
import { CustomerExperience } from "@/components/landing/CustomerExperience";
import { CoffeeMarquee } from "@/components/landing/CoffeeMarquee";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { Footer } from "@/components/landing/Footer";

const MidPageWaitlistCTA = () => (
  <section className="bg-cream py-16 sm:py-20">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-3xl border border-mint/40 bg-card px-8 py-10 text-center shadow-soft sm:px-12 sm:py-12">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Don't miss the Founding 100</p>
        <h3 className="font-display text-balance text-3xl font-medium leading-tight sm:text-4xl">
          Lock in your <span className="text-mint">half-price spot</span> before launch.
        </h3>
        <a
          href="#waitlist"
          className="group mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-mint px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-accent-foreground shadow-mint transition-transform duration-300 hover:scale-[1.04] active:scale-[0.98]"
        >
          Add me to the list
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </a>
        <p className="text-xs text-muted-foreground">No payment · No commitment · Just be first to know</p>
      </div>
    </div>
  </section>
);

const Index = () => {
  useReveal();
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <UrgencyStrip />
      <WhyLCP />
      <MidPageWaitlistCTA />
      <Plans />
      <ProductGlimpse />
      <Founding100 />
      <CustomerExperience />
      <CoffeeMarquee />
      <WaitlistForm />
      <Footer />
    </main>
  );
};

export default Index;
