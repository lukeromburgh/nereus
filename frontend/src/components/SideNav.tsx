import { NavLink } from "react-router-dom";
import {
  Activity,
  TrendingUp,
  Layers,
  BarChart2,
  Globe,
  FileText,
  LifeBuoy,
} from "lucide-react";

const navItems = [
  { key: "simulation", label: "Simulation", to: "/", icon: Activity },
  { key: "telemetry", label: "Telemetry", to: "/comparison", icon: TrendingUp },
  { key: "geometry", label: "Geometry", to: "/geometry", icon: Layers },
  { key: "analysis", label: "Analysis", to: "/analysis", icon: BarChart2 },
  { key: "environment", label: "Environment", to: "/environment", icon: Globe },
  { key: "reports", label: "Reports", to: "/reports", icon: FileText },
];

import pkg from "../../package.json";

export default function SideNav() {
  // Read app version from Vite env var `VITE_APP_VERSION` if set.
  // Fallback to `package.json`'s `version` field when the env var isn't provided.
  // Set `VITE_APP_VERSION` in a local `.env` (in `frontend/`) or in Vercel env settings.
  // Example locally: create `frontend/.env` with `VITE_APP_VERSION="v4.2.0-STABLE"` and restart dev server.
  const appVersion =
    import.meta.env.VITE_APP_VERSION || pkg.version || "v?.?.?";
  return (
    <nav className="fixed left-0 top-0 z-50 w-64 h-screen flex flex-col justify-between bg-surface-solid text-slate-300 border-r border-hud-border">
      <div className="px-4 pt-6">
        <div className="mb-6 px-2">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">
            Solver Engine
          </div>
          <div className="text-2xs text-slate-400 mt-1">{appVersion}</div>
        </div>

        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-r-md ml-2 transition-colors duration-150 hover:bg-surface-container ${
                      isActive
                        ? "bg-accent/5 border-l-2 border-accent-cyan text-accent-cyan"
                        : "text-slate-400"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-4 pb-6">
        <button className="w-full bg-accent-cyan text-surface-solid font-bold py-2 rounded-md shadow-sm">
          NEW RUN
        </button>

        <div className="mt-4 text-2xs text-slate-500 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-3 w-3 text-slate-500" />
            <span>Support</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-3 w-3 text-slate-500" />
            <span>System Logs</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
