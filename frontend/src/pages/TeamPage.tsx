import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Copy,
  FolderKanban,
  Link2,
  MailPlus,
  PenSquare,
  Plus,
  Shield,
  Users,
  X,
} from "lucide-react";
import apiClient, { isAxiosError } from "../lib/apiClient";
import { useAuth, type TeamRole } from "../lib/auth";
import { useSimStore } from "../store/useSimStore";

type TeamMember = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: TeamRole;
  created_at: string;
  updated_at: string;
};

type TeamProject = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type TeamInvite = {
  id: number;
  email: string;
  role: TeamRole;
  status: string;
  invite_url: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  invited_by_name: string | null;
};

type TeamDetail = {
  id: number;
  name: string;
  role: TeamRole | null;
  member_count: number;
  project_count: number;
  members: TeamMember[];
  projects: TeamProject[];
  invites: TeamInvite[];
};

const EDIT_ROLES: TeamRole[] = ["engineer", "team_admin"];

function formatRole(role: TeamRole | null | undefined, isSuperuser = false) {
  if (isSuperuser) return "Superuser";
  if (role === "team_admin") return "Team Admin";
  if (role === "engineer") return "Engineer";
  return "Viewer";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export default function TeamPage() {
  const navigate = useNavigate();
  const setProjectId = useSimStore((state) => state.setProjectId);
  const { user, activeTeam, activeTeamId, refreshUser } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [isRenamingTeam, setIsRenamingTeam] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [memberActionKey, setMemberActionKey] = useState<string | null>(null);

  const activeRole = activeTeam?.role ?? null;
  const canCreateProjects = Boolean(user?.is_superuser || (activeRole && EDIT_ROLES.includes(activeRole)));
  const canManageTeam = Boolean(user?.is_superuser || activeRole === "team_admin");

  const loadTeamWorkspace = useCallback(async () => {
    if (!activeTeamId) {
      setTeam(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<TeamDetail>(`/api/teams/${activeTeamId}/`);
      setTeam(data);
      setTeamNameDraft(data.name);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Failed to load the selected team."));
      setTeam(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    setTeamNameDraft(activeTeam?.name ?? "");
  }, [activeTeam?.name]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        await loadTeamWorkspace();
      } catch {
        if (!active) {
          return;
        }
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, [loadTeamWorkspace]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Members",
        value: String(team?.member_count ?? 0),
        detail: "Workspace seats with access",
      },
      {
        label: "Projects",
        value: String(team?.project_count ?? 0),
        detail: "Simulation workspaces in this team",
      },
      {
        label: "Your Access",
        value: formatRole(activeRole, user?.is_superuser),
        detail: "RBAC scope for this team",
      },
    ],
    [team?.member_count, team?.project_count, activeRole, user?.is_superuser],
  );

  const permissionCopy = useMemo(() => {
    if (user?.is_superuser) {
      return "You can manage every team and project in this environment.";
    }

    if (activeRole === "team_admin") {
      return "You can rename the team, create projects, issue invite links, and manage upcoming member changes.";
    }

    if (activeRole === "engineer") {
      return "You can create projects and work inside them, but team-level management stays locked to team admins.";
    }

    return "You can inspect members and projects, but write actions stay disabled until your role changes.";
  }, [activeRole, user?.is_superuser]);

  async function handleRenameTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team || !canManageTeam) return;

    const nextName = teamNameDraft.trim();
    if (!nextName || nextName === team.name) return;

    setIsRenamingTeam(true);
    setError(null);

    try {
      const { data } = await apiClient.patch<TeamDetail>(`/api/teams/${team.id}/`, {
        name: nextName,
      });
      setTeam(data);
      setTeamNameDraft(data.name);
      await refreshUser();
    } catch (renameError) {
      setError(getErrorMessage(renameError, "Failed to update team name."));
    } finally {
      setIsRenamingTeam(false);
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamId || !canCreateProjects) return;

    const nextName = projectName.trim();
    if (!nextName) return;

    setIsCreatingProject(true);
    setError(null);

    try {
      const { data } = await apiClient.post<TeamProject>("/api/projects/", {
        team: activeTeamId,
        name: nextName,
        description: projectDescription.trim() || undefined,
      });

      setTeam((current) => {
        if (!current) return current;
        const nextProjects = [data, ...current.projects].sort((left, right) =>
          right.updated_at.localeCompare(left.updated_at),
        );
        return {
          ...current,
          project_count: nextProjects.length,
          projects: nextProjects,
        };
      });
      setProjectName("");
      setProjectDescription("");
      await refreshUser();
    } catch (createError) {
      setError(getErrorMessage(createError, "Failed to create project."));
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team || !canManageTeam) return;

    const nextEmail = inviteEmail.trim().toLowerCase();
    if (!nextEmail) return;

    setIsCreatingInvite(true);
    setError(null);
    setInviteFeedback(null);

    try {
      const { data } = await apiClient.post<TeamInvite>(`/api/teams/${team.id}/invites/`, {
        email: nextEmail,
        role: inviteRole,
      });

      setTeam((current) => {
        if (!current) return current;
        return {
          ...current,
          invites: [data, ...current.invites],
        };
      });
      setInviteEmail("");
      setInviteRole("viewer");
      setInviteFeedback(`Invite created for ${data.email}. Share the magic link or copy it below.`);
    } catch (createError) {
      setError(getErrorMessage(createError, "Failed to create invite."));
    } finally {
      setIsCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(inviteId: number) {
    if (!team || !canManageTeam) return;

    setError(null);
    setInviteFeedback(null);

    try {
      const { data } = await apiClient.post<TeamInvite>(`/api/teams/${team.id}/invites/${inviteId}/revoke/`);
      setTeam((current) => {
        if (!current) return current;
        return {
          ...current,
          invites: current.invites.map((invite) => (invite.id === inviteId ? data : invite)),
        };
      });
    } catch (revokeError) {
      setError(getErrorMessage(revokeError, "Failed to revoke invite."));
    }
  }

  async function copyInviteLink(invite: TeamInvite) {
    setError(null);
    setInviteFeedback(null);

    try {
      await navigator.clipboard.writeText(invite.invite_url);
      setInviteFeedback(`Copied invite link for ${invite.email}.`);
    } catch (copyError) {
      setError(getErrorMessage(copyError, "Failed to copy the invite link."));
    }
  }

  async function handleMemberRoleChange(member: TeamMember, nextRole: TeamRole) {
    if (!team || !canManageTeam || member.role === nextRole) return;

    setMemberActionKey(`role:${member.id}`);
    setError(null);

    try {
      const { data } = await apiClient.patch<{ detail: string; member: TeamMember }>(`/api/teams/${team.id}/members/${member.id}/`, {
        role: nextRole,
      });
      setTeam((current) => {
        if (!current) return current;
        return {
          ...current,
          members: current.members.map((entry) => (entry.id === member.id ? data.member : entry)),
        };
      });
      if (user?.id === member.id) {
        await refreshUser();
      }
    } catch (updateError) {
      setError(getErrorMessage(updateError, "Failed to update member role."));
    } finally {
      setMemberActionKey(null);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    if (!team || !canManageTeam) return;
    if (!window.confirm(`Remove ${member.email || member.username} from ${team.name}?`)) {
      return;
    }

    setMemberActionKey(`remove:${member.id}`);
    setError(null);

    try {
      await apiClient.post(`/api/teams/${team.id}/members/${member.id}/remove/`);
      setTeam((current) => {
        if (!current) return current;
        return {
          ...current,
          member_count: Math.max(0, current.member_count - 1),
          members: current.members.filter((entry) => entry.id !== member.id),
        };
      });
      if (user?.id === member.id) {
        await refreshUser();
        navigate("/team", { replace: true });
      }
    } catch (removeError) {
      setError(getErrorMessage(removeError, "Failed to remove member."));
    } finally {
      setMemberActionKey(null);
    }
  }

  function openProject(project: TeamProject) {
    setProjectId(project.id);
    navigate("/");
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-nereus-base">
        <div
          className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
          style={{ borderRadius: "2px" }}
        />
      </div>
    );
  }

  if (!activeTeamId || !activeTeam) {
    return (
      <div className="flex h-full items-center justify-center bg-nereus-base px-6">
        <div
          className="max-w-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6 text-center"
          style={{ borderRadius: "2px" }}
        >
          <h1 className="text-xl font-semibold text-white">No team workspace selected</h1>
          <p className="mt-3 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">
            Sign in to a team-backed workspace before managing projects and permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.08),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.05),transparent_24%),#090b10]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
          <div
            className="relative overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 shadow-[0_18px_80px_rgba(0,0,0,0.28)]"
            style={{ borderRadius: "2px" }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.12),transparent_35%)]" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex items-center gap-2 border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.08)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-nereus-accent"
                  style={{ borderRadius: "2px" }}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Team Workspace
                </div>
                <div
                  className="inline-flex items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[rgba(255,255,255,0.55)]"
                  style={{ borderRadius: "2px" }}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {formatRole(activeRole, user?.is_superuser)}
                </div>
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-white">
                {team?.name ?? activeTeam.name}
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[rgba(255,255,255,0.6)]">
                Centralize projects, member context, and access rules in one place before users drop into simulation tools.
              </p>

              {error && (
                <div
                  className="mt-4 border border-[rgba(255,107,53,0.28)] bg-[rgba(255,107,53,0.08)] px-4 py-3 text-[12px] text-nereus-orange"
                  style={{ borderRadius: "2px" }}
                >
                  {error}
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {summaryCards.map((card) => (
                  <div
                    key={card.label}
                    className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4"
                    style={{ borderRadius: "2px" }}
                  >
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">{card.label}</div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{card.value}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[rgba(255,255,255,0.48)]">{card.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {canManageTeam && (
              <form
                onSubmit={handleRenameTeam}
                className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-2 text-white">
                  <PenSquare className="h-4 w-4 text-nereus-accent" />
                  <h2 className="text-[14px] font-semibold">Team Settings</h2>
                </div>
                <p className="mt-2 text-[12px] leading-6 text-[rgba(255,255,255,0.52)]">
                  Rename the workspace now. Member invites and magic links will build on top of this surface next.
                </p>
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Team Name</span>
                  <input
                    type="text"
                    value={teamNameDraft}
                    onChange={(event) => setTeamNameDraft(event.target.value)}
                    className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                    style={{ borderRadius: "2px" }}
                    placeholder="Foil Lab"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isRenamingTeam || teamNameDraft.trim().length === 0 || teamNameDraft.trim() === (team?.name ?? activeTeam.name)}
                  className="mt-4 inline-flex h-10 items-center justify-center bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                  style={{ borderRadius: "2px" }}
                >
                  {isRenamingTeam ? "Saving..." : "Save Team"}
                </button>
              </form>
            )}

            {canManageTeam && (
              <form
                onSubmit={handleCreateInvite}
                className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-2 text-white">
                  <MailPlus className="h-4 w-4 text-nereus-accent" />
                  <h2 className="text-[14px] font-semibold">Invite Teammate</h2>
                </div>
                <p className="mt-2 text-[12px] leading-6 text-[rgba(255,255,255,0.52)]">
                  Generate a magic link tied to an email address and role. Recipients can sign in and accept directly from the join page.
                </p>
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Invite Email</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                    style={{ borderRadius: "2px" }}
                    placeholder="engineer@foil-lab.com"
                    required
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                    className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                    style={{ borderRadius: "2px" }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="engineer">Engineer</option>
                    <option value="team_admin">Team Admin</option>
                  </select>
                </label>
                {inviteFeedback && (
                  <div
                    className="mt-4 border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.08)] px-3 py-2 text-[12px] text-nereus-accent"
                    style={{ borderRadius: "2px" }}
                  >
                    {inviteFeedback}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isCreatingInvite || inviteEmail.trim().length === 0}
                  className="mt-4 inline-flex h-10 items-center justify-center bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                  style={{ borderRadius: "2px" }}
                >
                  {isCreatingInvite ? "Generating..." : "Generate Invite"}
                </button>
              </form>
            )}

            {canCreateProjects ? (
              <form
                onSubmit={handleCreateProject}
                className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-2 text-white">
                  <Plus className="h-4 w-4 text-nereus-accent" />
                  <h2 className="text-[14px] font-semibold">Create Project</h2>
                </div>
                <p className="mt-2 text-[12px] leading-6 text-[rgba(255,255,255,0.52)]">
                  Start each hydrofoil program in its own project so assets, runs, and comparisons stay cleanly scoped.
                </p>
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Project Name</span>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                    style={{ borderRadius: "2px" }}
                    placeholder="Cruise foil baseline"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]">Description</span>
                  <textarea
                    value={projectDescription}
                    onChange={(event) => setProjectDescription(event.target.value)}
                    className="min-h-[92px] border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 py-2 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                    style={{ borderRadius: "2px" }}
                    placeholder="Baseline geometry, control runs, and comparison candidates."
                  />
                </label>
                <button
                  type="submit"
                  disabled={isCreatingProject || projectName.trim().length === 0}
                  className="mt-4 inline-flex h-10 items-center justify-center bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                  style={{ borderRadius: "2px" }}
                >
                  {isCreatingProject ? "Creating..." : "Create Project"}
                </button>
              </form>
            ) : (
              <div
                className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-2 text-white">
                  <Shield className="h-4 w-4 text-nereus-accent" />
                  <h2 className="text-[14px] font-semibold">Permission Scope</h2>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-[rgba(255,255,255,0.58)]">{permissionCopy}</p>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div
            className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
            style={{ borderRadius: "2px" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Projects</h2>
                <p className="mt-1 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]">
                  Team-scoped workspaces for assets, simulations, and result comparisons.
                </p>
              </div>
              <div
                className="inline-flex items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[rgba(255,255,255,0.42)]"
                style={{ borderRadius: "2px" }}
              >
                <FolderKanban className="h-3.5 w-3.5 text-nereus-accent" />
                {team?.projects.length ?? 0} Active
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {team?.projects.length ? (
                team.projects.map((project) => (
                  <article
                    key={project.id}
                    className="flex flex-col justify-between border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4"
                    style={{ borderRadius: "2px" }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[15px] font-semibold text-white">{project.name}</h3>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.34)]">
                            Updated {formatDate(project.updated_at)}
                          </div>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 text-[rgba(255,255,255,0.28)]" />
                      </div>
                      <p className="mt-3 min-h-[72px] text-[13px] leading-6 text-[rgba(255,255,255,0.58)]">
                        {project.description || "No project description yet. Add one to clarify the design intent and test program."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className="mt-4 inline-flex h-9 items-center justify-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-white transition-colors hover:border-[rgba(0,212,255,0.3)] hover:text-nereus-accent"
                      style={{ borderRadius: "2px" }}
                    >
                      Open Project
                    </button>
                  </article>
                ))
              ) : (
                <div
                  className="border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] p-6 text-[13px] leading-6 text-[rgba(255,255,255,0.52)] lg:col-span-2"
                  style={{ borderRadius: "2px" }}
                >
                  No projects yet. Create the first project from the right rail to anchor simulation work to this team.
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div
              className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
              style={{ borderRadius: "2px" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Members</h2>
                  <p className="mt-1 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]">
                    Team membership and role visibility for the active workspace.
                  </p>
                </div>
                <Users className="h-4 w-4 text-nereus-accent" />
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {team?.members.map((member) => {
                  const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username;
                  return (
                    <div
                      key={member.id}
                      className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4"
                      style={{ borderRadius: "2px" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-medium text-white">{displayName}</div>
                          <div className="mt-1 text-[12px] text-[rgba(255,255,255,0.5)]">{member.email || member.username}</div>
                        </div>
                          {canManageTeam ? (
                            <select
                              value={member.role}
                              onChange={(event) => handleMemberRoleChange(member, event.target.value as TeamRole)}
                              disabled={memberActionKey === `role:${member.id}`}
                              className="h-8 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-[10px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.72)] outline-none disabled:cursor-not-allowed"
                              style={{ borderRadius: "2px" }}
                            >
                              <option value="viewer">Viewer</option>
                              <option value="engineer">Engineer</option>
                              <option value="team_admin">Team Admin</option>
                            </select>
                          ) : (
                            <div
                              className="inline-flex items-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.56)]"
                              style={{ borderRadius: "2px" }}
                            >
                              {formatRole(member.role)}
                            </div>
                          )}
                      </div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.32)]">
                        Joined {formatDate(member.created_at)}
                      </div>
                        {canManageTeam && (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member)}
                              disabled={memberActionKey === `remove:${member.id}`}
                              className="inline-flex h-8 items-center gap-1.5 border border-[rgba(255,107,53,0.22)] bg-[rgba(255,107,53,0.08)] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-nereus-orange transition-colors hover:border-[rgba(255,107,53,0.36)] disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.26)]"
                              style={{ borderRadius: "2px" }}
                            >
                              <X className="h-3.5 w-3.5" />
                              {memberActionKey === `remove:${member.id}` ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-5"
              style={{ borderRadius: "2px" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Invites</h2>
                  <p className="mt-1 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]">
                    Magic links for pending, accepted, revoked, and expired invites.
                  </p>
                </div>
                <Link2 className="h-4 w-4 text-nereus-accent" />
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {team?.invites.length ? (
                  team.invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4"
                      style={{ borderRadius: "2px" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-medium text-white">{invite.email}</div>
                          <div className="mt-1 text-[12px] text-[rgba(255,255,255,0.5)]">
                            {formatRole(invite.role)} invited{invite.invited_by_name ? ` by ${invite.invited_by_name}` : ""}
                          </div>
                        </div>
                        <div
                          className="inline-flex items-center border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.56)]"
                          style={{ borderRadius: "2px" }}
                        >
                          {invite.status}
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.32)]">
                        Expires {formatDate(invite.expires_at)}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyInviteLink(invite)}
                          disabled={invite.status !== "pending"}
                          className="inline-flex h-8 items-center gap-1.5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-white transition-colors hover:border-[rgba(0,212,255,0.3)] hover:text-nereus-accent disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.26)]"
                          style={{ borderRadius: "2px" }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Link
                        </button>
                        {canManageTeam && (
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(invite.id)}
                            disabled={invite.status !== "pending"}
                            className="inline-flex h-8 items-center gap-1.5 border border-[rgba(255,107,53,0.22)] bg-[rgba(255,107,53,0.08)] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-nereus-orange transition-colors hover:border-[rgba(255,107,53,0.36)] disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.26)]"
                            style={{ borderRadius: "2px" }}
                          >
                            <X className="h-3.5 w-3.5" />
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    className="border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] p-6 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]"
                    style={{ borderRadius: "2px" }}
                  >
                    No invites yet. Generate a magic link from the right rail to bring engineers or viewers into this team.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}