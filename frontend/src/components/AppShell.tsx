import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import SideNav from "./SideNav";
import { Waves } from "lucide-react";
import { ToolbarContext } from "../hooks/useToolbar";
import type { ReactNode } from "react";
import apiClient from "../lib/apiClient";
import { useAuth, type TeamRole } from "../lib/auth";
import { useSimStore } from "../store/useSimStore";

type ProjectSummary = {
  id: number;
  name: string;
  team: number;
};

function formatRoleLabel(role: TeamRole | null | undefined, isSuperuser = false) {
  if (isSuperuser) {
    return "Superuser";
  }

  if (role === "team_admin") {
    return "Team Admin";
  }

  if (role === "engineer") {
    return "Engineer";
  }

  return "Viewer";
}

// ── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const [toolbarContent, setToolbarContentRaw] = useState<ReactNode>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const { user, logout, activeTeam, activeTeamId, setActiveTeamId } = useAuth();
  const projectId = useSimStore((state) => state.projectId);
  const setProjectId = useSimStore((state) => state.setProjectId);

  const setToolbarContent = useCallback((content: ReactNode) => {
    setToolbarContentRaw(content);
  }, []);

  const currentProjectName = useMemo(
    () => projects.find((project) => project.id === projectId)?.name ?? null,
    [projects, projectId],
  );

  const activeRoleLabel = useMemo(
    () => formatRoleLabel(activeTeam?.role, user?.is_superuser),
    [activeTeam?.role, user?.is_superuser],
  );

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
      if (!user || !activeTeamId) {
        if (active) {
          setProjects([]);
          setIsProjectLoading(false);
        }
        return;
      }

      setIsProjectLoading(true);
      try {
        const { data } = await apiClient.get<ProjectSummary[]>('/api/projects/', {
          params: { team: activeTeamId },
        });
        if (!active) return;

        const nextProjects = Array.isArray(data) ? data : [];
        setProjects(nextProjects);
        if (nextProjects.length === 0) {
          return;
        }

        const selectedProject = nextProjects.find((project) => project.id === projectId) ?? nextProjects[0];
        if (selectedProject.id !== projectId) {
          setProjectId(selectedProject.id);
        }
      } catch (error) {
        console.error('Failed to bootstrap project context', error);
        if (active) {
          setProjects([]);
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
  }, [user, activeTeamId, projectId, setProjectId]);

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
                  <div className="hidden items-center gap-2 lg:flex">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Team</span>
                    {user.teams.length > 1 ? (
                      <select
                        value={activeTeamId ?? ""}
                        onChange={(event) => setActiveTeamId(Number(event.target.value))}
                        className="h-7 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 text-[11px] text-white outline-none"
                        style={{ borderRadius: "2px" }}
                      >
                        {user.teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div
                        className="inline-flex h-7 items-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-[11px] text-white"
                        style={{ borderRadius: "2px" }}
                      >
                        {activeTeam?.name ?? "No team"}
                      </div>
                    )}
                  </div>
                  {projects.length > 0 && (
                    <div className="hidden items-center gap-2 lg:flex">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Project</span>
                      {projects.length > 1 ? (
                        <select
                          value={projectId}
                          onChange={(event) => setProjectId(Number(event.target.value))}
                          className="h-7 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 text-[11px] text-white outline-none"
                          style={{ borderRadius: "2px" }}
                        >
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div
                          className="inline-flex h-7 items-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-[11px] text-white"
                          style={{ borderRadius: "2px" }}
                        >
                          {currentProjectName}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="hidden text-right sm:block">
                    <div className="text-[11px] font-medium text-white">{user.first_name || user.username}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.35)]">
                      {activeTeam?.name ?? "No team assigned"} · {activeRoleLabel}
                    </div>
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
