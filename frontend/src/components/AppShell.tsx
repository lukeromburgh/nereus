import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import SideNav from "./SideNav";
import { Waves } from "lucide-react";

// ── Toolbar Context ──────────────────────────────────────────────────────────
// Pages call `useToolbar()` to inject their specific controls into the top bar.

interface ToolbarContextValue {
  setToolbarContent: (content: ReactNode) => void;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export function useToolbar() {
  const ctx = useContext(ToolbarContext);
  if (!ctx) throw new Error("useToolbar must be used within <AppShell>");
  return ctx;
}

// ── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const [toolbarContent, setToolbarContentRaw] = useState<ReactNode>(null);

  const setToolbarContent = useCallback((content: ReactNode) => {
    setToolbarContentRaw(content);
  }, []);

  return (
    <ToolbarContext.Provider value={{ setToolbarContent }}>
      <div className="flex h-screen w-screen bg-[#0d1518] text-slate-100 overflow-hidden font-sans">
        {/* ── Left Sidebar: Main Navigation ──────────────────────────────── */}
        <SideNav />

        {/* ── Main Content Area ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top Toolbar: Contextual per-page actions ──────────────── */}
          <header className="h-11 flex items-center justify-between px-4 border-b border-hud-border bg-surface-solid/90 backdrop-blur-hud flex-shrink-0">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Waves className="h-4 w-4 text-accent-cyan animate-wave" />
              <span className="text-sm font-semibold tracking-wide text-slate-100">
                NEREUS
              </span>
              <div className="h-4 w-px bg-slate-700/50" />
              <span className="text-2xs text-slate-500 tracking-wider uppercase">
                CFD Dashboard
              </span>
            </div>

            {/* Page-specific toolbar content */}
            <div className="flex items-center gap-2">
              {toolbarContent}
            </div>
          </header>

          {/* ── Page Content (Outlet) ─────────────────────────────────── */}
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </ToolbarContext.Provider>
  );
}
