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
    {/* Build credit — kept on its own row, dimmer than the brand line so
        it reads as a quiet attribution instead of competing for the eye. */}
    <div className="container mx-auto mt-6 px-6 text-center text-[11px] text-white/35">
      Developed and managed by{" "}
      <a
        href="https://impactvisualbranding.co.uk"
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-4 transition-colors hover:text-mint hover:underline"
      >
        Impact Visual Branding
      </a>
    </div>
  </footer>
);
