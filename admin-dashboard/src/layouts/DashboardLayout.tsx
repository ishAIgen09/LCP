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
        <div className="mx-auto w-full max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
      {/* Floating LCP Data Assistant — positioned fixed inside its own
          component, persists across every tab. */}
      <ChatWidget />
    </div>
  );
}
