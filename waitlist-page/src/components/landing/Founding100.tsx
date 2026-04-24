const steps = [
  { n: "01", title: "Join the waitlist", body: "Drop your details below. Takes 20 seconds." },
  { n: "02", title: "Get the launch email first", body: "Waitlist members hear before anyone else — hours, sometimes days, before the public." },
  { n: "03", title: "Sign up in the first 100", body: "Move fast. Founding spots fill first-come, first-served. Once they're gone, they're gone." },
  { n: "04", title: "Half-price coffee tech, for life", body: "Lock in £5 (Private) or £7.99 (LCP+) every month, forever — as long as you stay with us." },
];

export const Founding100 = () => (
  <section className="bg-cream py-24 sm:py-32">
    <div className="container mx-auto px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">The Founding 100</p>
        <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
          Be one of the first hundred cafes. Pay founding price for life.
        </h2>
        <p className="mt-5 text-muted-foreground">
          Joining the waitlist isn't the same as becoming a Founding Member — but it's how you give yourself the best shot at being in that first 100.
        </p>
      </div>

      <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="reveal relative rounded-2xl border border-border bg-card p-7 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:shadow-elegant"
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <span className="font-display text-mint mb-3 block text-3xl font-semibold tabular-nums">{s.n}</span>
            <h3 className="font-display mb-2 text-lg font-semibold">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
