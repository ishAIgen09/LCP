import type { LucideIcon } from "lucide-react";

// Shared scaffold for the 5 tabs. Every page ships with an identical
// header + "coming soon" card so sidebar clicks feel consistent and
// visually prove the router is wired. When a tab gets real functionality,
// replace the <PlaceholderPage/> call with the real UI.

export function PlaceholderPage({
  Icon,
  kicker,
  title,
  blurb,
}: {
  Icon: LucideIcon;
  kicker: string;
  title: string;
  blurb: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
          {kicker}
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        {blurb}
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-neutral-600" strokeWidth={1.8} />
          <div>
            <div className="text-sm font-semibold text-neutral-200">
              Coming soon
            </div>
            <div className="mt-0.5 text-xs text-neutral-500">
              Placeholder for route scaffolding. Real UI lands in a follow-up.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
