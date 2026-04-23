import { NavLink, useNavigate } from "react-router-dom";
import {
  Coffee,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";

import { logout } from "@/lib/auth";

type NavItem = {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

const NAV: NavItem[] = [
  { to: "/overview", label: "Overview", Icon: LayoutDashboard },
  { to: "/cafes", label: "Cafes", Icon: Coffee },
  { to: "/customers", label: "Customers", Icon: Users },
  { to: "/transactions", label: "Transactions", Icon: Receipt },
  { to: "/billing", label: "Billing", Icon: CreditCard },
];

export function Sidebar() {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    // Replace history so the back button doesn't bring the logged-in
    // shell back — once out, you stay out until you sign in again.
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/15 ring-1 ring-amber-500/30">
          <ShieldCheck className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            LCP Admin
          </span>
          <span className="text-[10px] text-neutral-500">Command Center</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-neutral-800/80 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={
                        isActive
                          ? "h-4 w-4 text-amber-400"
                          : "h-4 w-4 text-neutral-500 group-hover:text-neutral-300"
                      }
                      strokeWidth={2}
                    />
                    <span className="font-medium">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-neutral-800 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
