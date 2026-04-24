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

const Index = () => {
  useReveal();
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <UrgencyStrip />
      <WhyLCP />
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
