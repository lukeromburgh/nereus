import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import SideNav from "./SideNav";
import { Waves } from "lucide-react";
import { ToolbarContext } from "../hooks/useToolbar";
import type { ReactNode } from "react";

// ── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const [toolbarContent, setToolbarContentRaw] = useState<ReactNode>(null);

  const setToolbarContent = useCallback((content: ReactNode) => {
    setToolbarContentRaw(content);
  }, []);

  return (
    <ToolbarContext.Provider value={{ setToolbarContent }}>
      <div className="flex h-screen w-screen bg-nereus-base text-[rgba(255,255,255,0.9)] overflow-hidden font-sans">
        {/* ── Left Sidebar: Main Navigation ──────────────────────────────── */}
        <SideNav />

        {/* ── Main Content Area ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top Toolbar: Contextual per-page actions ──────────────── */}
          <header className="h-10 flex items-center justify-between px-3 border-b border-[rgba(255,255,255,0.06)] bg-nereus-base flex-shrink-0">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-nereus-accent" />
              <span className="text-[11px] font-mono font-medium tracking-[0.15em] uppercase text-[rgba(255,255,255,0.5)]">
                NEREUS
              </span>
              <div className="h-3 w-px bg-[rgba(255,255,255,0.06)]" />
              <span className="text-[10px] text-[rgba(255,255,255,0.3)] tracking-[0.1em] uppercase">
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
