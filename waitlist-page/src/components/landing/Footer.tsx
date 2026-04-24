export const Footer = () => (
  <footer className="bg-espresso border-t border-white/10 py-10 text-white/60">
    <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm sm:flex-row">
      <div className="flex flex-col items-center gap-0.5 sm:items-start">
        <span className="font-display text-mint text-lg font-semibold leading-none">Local Coffee Perks</span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">For the regulars · Launching 2026</span>
      </div>
      <a href="mailto:hello@localcoffeeperks.com" className="hover:text-mint transition-colors">
        hello@localcoffeeperks.com
      </a>
      <p className="text-xs text-white/40">© {new Date().getFullYear()} Local Coffee Perks.</p>
    </div>
  </footer>
);
