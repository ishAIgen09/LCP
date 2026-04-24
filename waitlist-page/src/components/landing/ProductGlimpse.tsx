import dashboard from "@/assets/dashboard.png";
import consumerApp from "@/assets/consumer-app.png";

export const ProductGlimpse = () => (
  <section className="relative overflow-hidden bg-espresso py-24 text-white sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-white/55">A glimpse of the product</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          Quietly powerful, in your hands.
        </h2>
        <p className="mt-5 text-white/70">
          Never lose a loyalty card again. Track your earned stamps, view your complete coffee history, and redeem free drinks across independent cafes — all from one clean digital wallet.
        </p>
      </div>

      <div className="reveal mt-16 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-center">
        {/* Dashboard mockup */}
        <div className="relative">
          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-elegant transition-transform duration-700 hover:rotate-0"
            style={{ transform: "perspective(1400px) rotateY(-6deg) rotateX(2deg)" }}
          >
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </div>
            <img
              src={dashboard}
              alt="LCP cafe owner dashboard showing customer insights and Shadow Ledger activity"
              loading="lazy"
              className="block w-full"
            />
          </div>
          <p className="mt-5 text-sm text-white/65">
            Owner dashboard — daily stamps, redemptions, and the regulars who keep your cafe alive.
          </p>
        </div>

        {/* Consumer thumbnail */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="relative mx-auto w-[180px] sm:w-[200px]">
            <div className="rounded-[2rem] border-[6px] border-white/15 bg-espresso-soft p-1 shadow-elegant">
              <img
                src={consumerApp}
                alt="LCP consumer app stamp card preview"
                loading="lazy"
                className="block w-full rounded-[1.5rem]"
              />
            </div>
            <span className="absolute -right-3 -top-3 rounded-full bg-mint px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground shadow-mint">
              For coffee lovers
            </span>
          </div>
          <p className="mt-6 max-w-xs text-sm text-white/65">
            Your customers get a beautiful, simple pass. No clutter, no learning curve.
          </p>
        </div>
      </div>
    </div>
  </section>
);
