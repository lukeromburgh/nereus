import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Building2,
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
  { key: "team", label: "Team", to: "/team", icon: Building2 },
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
    <nav className="w-[180px] h-full flex flex-col justify-between bg-[#0d0f14] text-[rgba(255,255,255,0.45)] border-r border-[rgba(255,255,255,0.06)] flex-shrink-0">
      <div className="px-3 pt-4">
        <div className="mb-4 px-2">
          <div className="text-[11px] font-mono tracking-[0.15em] uppercase text-[rgba(255,255,255,0.5)]">
            Solver Engine
          </div>
          <div className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5 font-mono">{appVersion}</div>
        </div>

        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-2 py-2 transition-colors duration-150 ${
                      isActive
                        ? "border-l-2 border-nereus-accent bg-[rgba(0,212,255,0.06)] text-white"
                        : "border-l-2 border-transparent text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.03)]"
                    }`
                  }
                >
                  <Icon className="h-[14px] w-[14px]" />
                  <span className="text-[12px] font-medium">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-3 pb-4">
        <button
          onClick={() => {
            resetForNewRun();
            navigate("/");
          }}
          className="w-full bg-[#00d4ff] text-[#0a0b0d] hover:bg-[#00bfe8] font-medium py-0 h-8 text-[12px] tracking-[0.05em] uppercase"
          style={{ borderRadius: '2px' }}
        >
          NEW RUN
        </button>

        <div className="mt-3 text-[10px] text-[rgba(255,255,255,0.3)] flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <LifeBuoy className="h-[14px] w-[14px]" />
            <span>Support</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="h-[14px] w-[14px]" />
            <span>System Logs</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
