import { Outlet } from "react-router-dom";

import { ChatWidget } from "@/components/ChatWidget";
import { Sidebar } from "@/components/Sidebar";

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full bg-neutral-950 text-neutral-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Inner max-width keeps wide screens readable; the sidebar is the
            persistent frame, <Outlet/> hosts each tab's page component. */}
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-8 py-8">
          <div className="flex-1">
            <Outlet />
          </div>
          {/* Quiet attribution at the absolute bottom of the dashboard
              shell — matches the credit on the main website and b2b
              dashboard so every LCP surface points at the build
              agency identically. */}
          <footer className="mt-10 pt-6 text-center text-[11px] text-neutral-500">
            Developed and managed by{" "}
            <a
              href="https://impactvisualbranding.co.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 transition-colors hover:text-emerald-400 hover:underline"
            >
              Impact Visual Branding
            </a>
          </footer>
        </div>
      </main>
      {/* Floating LCP Data Assistant — positioned fixed inside its own
          component, persists across every tab. */}
      <ChatWidget />
    </div>
  );
}
