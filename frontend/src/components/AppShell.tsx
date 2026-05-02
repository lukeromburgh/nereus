import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import SideNav from "./SideNav";
import { Waves } from "lucide-react";
import { ToolbarContext } from "../hooks/useToolbar";
import type { ReactNode } from "react";
import apiClient from "../lib/apiClient";
import { useAuth } from "../lib/auth";
import { useSimStore } from "../store/useSimStore";

type ProjectSummary = {
  id: number;
  name: string;
};

// ── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const [toolbarContent, setToolbarContentRaw] = useState<ReactNode>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const projectId = useSimStore((state) => state.projectId);
  const setProjectId = useSimStore((state) => state.setProjectId);

  const setToolbarContent = useCallback((content: ReactNode) => {
    setToolbarContentRaw(content);
  }, []);

  const teamSummary = useMemo(() => {
    if (!user?.teams?.length) return "No team assigned";
    return user.teams.map((team) => team.name).join(", ");
  }, [user]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Failed to log out", error);
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout]);

  useEffect(() => {
    let active = true;

    async function bootstrapProject() {
      if (!user) {
        if (active) {
          setCurrentProjectName(null);
          setIsProjectLoading(false);
        }
        return;
      }

      setIsProjectLoading(true);
      try {
        const { data } = await apiClient.get<ProjectSummary[]>('/api/projects/');
        if (!active) return;

        const projects = Array.isArray(data) ? data : [];
        if (projects.length === 0) {
          setCurrentProjectName(null);
          return;
        }

        const selectedProject = projects.find((project) => project.id === projectId) ?? projects[0];
        setProjectId(selectedProject.id);
        setCurrentProjectName(selectedProject.name);
      } catch (error) {
        console.error('Failed to bootstrap project context', error);
        if (active) {
          setCurrentProjectName(null);
        }
      } finally {
        if (active) {
          setIsProjectLoading(false);
        }
      }
    }

    bootstrapProject();
    return () => {
      active = false;
    };
  }, [user, projectId, setProjectId]);

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
              {currentProjectName && (
                <>
                  <div className="h-3 w-px bg-[rgba(255,255,255,0.06)]" />
                  <span className="text-[10px] text-[rgba(255,255,255,0.38)] tracking-[0.08em] uppercase">
                    {currentProjectName}
                  </span>
                </>
              )}
            </div>

            {/* Page-specific toolbar content */}
            <div className="flex items-center gap-2">
              {toolbarContent}
              {user && (
                <>
                  <div className="h-4 w-px bg-[rgba(255,255,255,0.08)]" />
                  <div className="hidden text-right sm:block">
                    <div className="text-[11px] font-medium text-white">{user.first_name || user.username}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.35)]">{teamSummary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="inline-flex h-7 items-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[rgba(255,255,255,0.55)] transition-colors hover:border-[rgba(255,107,53,0.3)] hover:text-nereus-orange disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.25)]"
                    style={{ borderRadius: "2px" }}
                  >
                    {isLoggingOut ? "Signing out" : "Log out"}
                  </button>
                </>
              )}
            </div>
          </header>

          {/* ── Page Content (Outlet) ─────────────────────────────────── */}
          <div className="flex-1 overflow-hidden">
            {isProjectLoading ? (
              <div className="flex h-full items-center justify-center bg-nereus-base">
                <div
                  className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
                  style={{ borderRadius: "2px" }}
                />
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </div>
    </ToolbarContext.Provider>
  );
}
