import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  FolderOpen,
  TrendingUp,
  LifeBuoy,
  FileText,
} from "lucide-react";
import { useSimStore } from "../store/useSimStore";

const navItems = [
  { key: "simulation", label: "Simulation", to: "/", icon: Activity },
  { key: "assets", label: "Assets", to: "/assets", icon: FolderOpen },
  { key: "telemetry", label: "Telemetry", to: "/comparison", icon: TrendingUp },
];

import pkg from "../../package.json";

export default function SideNav() {
  const navigate = useNavigate();
  const resetForNewRun = useSimStore((s) => s.resetForNewRun);
  // Read app version from Vite env var `VITE_APP_VERSION` if set.
  // Fallback to `package.json`'s `version` field when the env var isn't provided.
  // Set `VITE_APP_VERSION` in a local `.env` (in `frontend/`) or in Vercel env settings.
  // Example locally: create `frontend/.env` with `VITE_APP_VERSION="v4.2.0-STABLE"` and restart dev server.
  const appVersion =
    import.meta.env.VITE_APP_VERSION || pkg.version || "v?.?.?";
  return (
    <nav className="w-56 h-full flex flex-col justify-between bg-surface-solid text-slate-300 border-r border-hud-border flex-shrink-0">
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
        <button
          onClick={() => {
            resetForNewRun();
            navigate("/");
          }}
          className="w-full bg-accent/90 text-white hover:bg-accent  font-semi-bold py-2 rounded-md shadow-sm"
        >
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
