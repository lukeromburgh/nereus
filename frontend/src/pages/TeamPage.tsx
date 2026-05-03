import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  FolderPlus,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import apiClient, { isAxiosError } from "../lib/apiClient";
import { useAuth, type TeamRole } from "../lib/auth";
import { useSimStore } from "../store/useSimStore";

type TeamTab = "overview" | "members" | "invites" | "settings";

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

type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired";

type TeamInvite = {
  id: number;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  invite_url: string;
  expires_at: string;
  last_sent_at: string | null;
  send_count: number;
  delivery_error: string;
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

type CreatedProject = {
  id: number;
  name: string;
};

type TeamActivityItem = {
  id: string;
  label: string;
  meta: string;
  timestamp: string;
};

const teamTabs: Array<{ id: TeamTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invites" },
  { id: "settings", label: "Settings" },
];

const roleOptions: TeamRole[] = ["viewer", "engineer", "team_admin"];

function formatRoleLabel(role: TeamRole | null | undefined) {
  if (role === "team_admin") {
    return "Team Admin";
  }

  if (role === "engineer") {
    return "Engineer";
  }

  return "Viewer";
}

function formatInviteStatus(status: TeamInviteStatus) {
  if (status === "accepted") {
    return "Accepted";
  }

  if (status === "revoked") {
    return "Revoked";
  }

  if (status === "expired") {
    return "Expired";
  }

  return "Pending";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getMemberName(member: TeamMember) {
  const fullName = `${member.first_name} ${member.last_name}`.trim();
  return fullName || member.email || member.username;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const responseData = error.response?.data as unknown;

    if (typeof responseData === "string" && responseData.trim()) {
      return responseData;
    }

    if (responseData && typeof responseData === "object") {
      const detail = (responseData as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) {
        return detail;
      }

      for (const value of Object.values(responseData as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) {
          return value;
        }

        if (Array.isArray(value) && typeof value[0] === "string") {
          return value[0];
        }
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function roleBadgeClass(role: TeamRole | null | undefined) {
  if (role === "team_admin") {
    return "border-[rgba(0,212,255,0.22)] bg-[rgba(0,212,255,0.08)] text-nereus-accent";
  }

  if (role === "engineer") {
    return "border-[rgba(125,211,252,0.18)] bg-[rgba(125,211,252,0.08)] text-sky-200";
  }

  return "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.65)]";
}

function inviteStatusClass(status: TeamInviteStatus) {
  if (status === "accepted") {
    return "border-[rgba(52,211,153,0.24)] bg-[rgba(52,211,153,0.08)] text-emerald-300";
  }

  if (status === "pending") {
    return "border-[rgba(0,212,255,0.22)] bg-[rgba(0,212,255,0.08)] text-nereus-accent";
  }

  if (status === "expired") {
    return "border-[rgba(255,184,77,0.24)] bg-[rgba(255,184,77,0.08)] text-amber-300";
  }

  return "border-[rgba(255,107,53,0.24)] bg-[rgba(255,107,53,0.08)] text-nereus-orange";
}

export default function TeamPage() {
  const navigate = useNavigate();
  const setProjectId = useSimStore((state) => state.setProjectId);
  const { user, activeTeam, activeTeamId, setActiveTeamId, refreshUser } = useAuth();

  const [activeTab, setActiveTab] = useState<TeamTab>("overview");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [isSavingTeam, setIsSavingTeam] = useState(false);

  const [roleDrafts, setRoleDrafts] = useState<Record<number, TeamRole>>({});
  const [updatingMemberId, setUpdatingMemberId] = useState<number | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<number | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<number | null>(null);
  const [copyingInviteId, setCopyingInviteId] = useState<number | null>(null);

  const canManageTeam = Boolean(user?.is_superuser || activeTeam?.role === "team_admin");
  const canEditProjects = Boolean(
    user?.is_superuser || activeTeam?.role === "team_admin" || activeTeam?.role === "engineer",
  );

  useEffect(() => {
    let active = true;

    async function loadTeamDetail() {
      if (!activeTeamId) {
        if (!active) {
          return;
        }

        setTeam(null);
        setError("No active team is available for this account.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const { data } = await apiClient.get<TeamDetail>(`/api/teams/${activeTeamId}/`);
        if (!active) {
          return;
        }

        setTeam(data);
        setTeamName(data.name);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setTeam(null);
        setError(getErrorMessage(loadError, "Failed to load team workspace."));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadTeamDetail();

    return () => {
      active = false;
    };
  }, [activeTeamId]);

  useEffect(() => {
    if (!team) {
      setRoleDrafts({});
      return;
    }

    setRoleDrafts(
      Object.fromEntries(team.members.map((member) => [member.id, member.role])),
    );
  }, [team]);

  useEffect(() => {
    setTeamName(team?.name ?? activeTeam?.name ?? "");
  }, [team?.name, activeTeam?.name]);

  const sortedMembers = useMemo(() => {
    if (!team) {
      return [];
    }

    return [...team.members].sort((left, right) => {
      const leftWeight = left.role === "team_admin" ? 0 : left.role === "engineer" ? 1 : 2;
      const rightWeight = right.role === "team_admin" ? 0 : right.role === "engineer" ? 1 : 2;

      if (leftWeight !== rightWeight) {
        return leftWeight - rightWeight;
      }

      return getMemberName(left).localeCompare(getMemberName(right));
    });
  }, [team]);

  const sortedProjects = useMemo(() => {
    if (!team) {
      return [];
    }

    return [...team.projects].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }, [team]);

  const sortedInvites = useMemo(() => {
    if (!team) {
      return [];
    }

    return [...team.invites].sort((left, right) => right.created_at.localeCompare(left.created_at));
  }, [team]);

  const pendingInviteCount = useMemo(
    () => sortedInvites.filter((invite) => invite.status === "pending").length,
    [sortedInvites],
  );

  const recentActivity = useMemo<TeamActivityItem[]>(() => {
    const activity: TeamActivityItem[] = [];

    for (const project of sortedProjects.slice(0, 4)) {
      activity.push({
        id: `project-${project.id}`,
        label: project.name,
        meta: "Project updated",
        timestamp: project.updated_at,
      });
    }

    for (const invite of sortedInvites.slice(0, 4)) {
      activity.push({
        id: `invite-${invite.id}`,
        label: invite.email,
        meta: `${formatInviteStatus(invite.status)} invite`,
        timestamp: invite.last_sent_at || invite.updated_at,
      });
    }

    return activity
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 6);
  }, [sortedInvites, sortedProjects]);

  async function reloadTeamDetail() {
    if (!activeTeamId) {
      return null;
    }

    const { data } = await apiClient.get<TeamDetail>(`/api/teams/${activeTeamId}/`);
    setTeam(data);
    setTeamName(data.name);
    setError(null);
    return data;
  }

  async function handleRefresh() {
    if (!activeTeamId) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      await reloadTeamDetail();
      setNotice("Team workspace refreshed.");
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, "Failed to refresh team workspace."));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamId || !projectName.trim()) {
      return;
    }

    setIsCreatingProject(true);
    setError(null);

    try {
      const { data } = await apiClient.post<CreatedProject>("/api/projects/", {
        name: projectName.trim(),
        description: projectDescription.trim(),
        team: activeTeamId,
      });

      await reloadTeamDetail();
      await refreshUser();
      setProjectId(data.id);
      setProjectName("");
      setProjectDescription("");
      setNotice(`Created project ${data.name}.`);
    } catch (createError) {
      setError(getErrorMessage(createError, "Failed to create project."));
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamId || !inviteEmail.trim()) {
      return;
    }

    setIsCreatingInvite(true);
    setError(null);

    try {
      const { data } = await apiClient.post<TeamInvite>(`/api/teams/${activeTeamId}/invites/`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });

      await reloadTeamDetail();
      setInviteEmail("");
      setInviteRole("viewer");
      setNotice(
        data.delivery_error
          ? `Invite created for ${data.email}, but email delivery failed. Use copy link or resend once email is configured.`
          : `Invite sent to ${data.email}.`,
      );
    } catch (inviteError) {
      setError(getErrorMessage(inviteError, "Failed to create invite."));
    } finally {
      setIsCreatingInvite(false);
    }
  }

  async function handleMemberRoleChange(member: TeamMember, nextRole: TeamRole) {
    if (!activeTeamId || nextRole === member.role) {
      return;
    }

    setRoleDrafts((current) => ({ ...current, [member.id]: nextRole }));
    setUpdatingMemberId(member.id);
    setError(null);

    try {
      await apiClient.patch(`/api/teams/${activeTeamId}/members/${member.id}/`, {
        role: nextRole,
      });

      await reloadTeamDetail();
      if (member.id === user?.id) {
        await refreshUser();
      }
      setNotice(`Updated ${getMemberName(member)} to ${formatRoleLabel(nextRole)}.`);
    } catch (updateError) {
      setRoleDrafts((current) => ({ ...current, [member.id]: member.role }));
      setError(getErrorMessage(updateError, "Failed to update member role."));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    if (!activeTeamId) {
      return;
    }

    const confirmed = window.confirm(`Remove ${getMemberName(member)} from ${team?.name ?? "this team"}?`);
    if (!confirmed) {
      return;
    }

    setRemovingMemberId(member.id);
    setError(null);

    try {
      await apiClient.post(`/api/teams/${activeTeamId}/members/${member.id}/remove/`);

      if (member.id === user?.id) {
        const nextUser = await refreshUser();
        const nextTeamId = nextUser?.teams[0]?.id ?? null;
        setActiveTeamId(nextTeamId);
        setNotice(`You left ${team?.name ?? "the team"}.`);
        navigate(nextTeamId ? "/team" : "/", { replace: true });
        return;
      }

      await reloadTeamDetail();
      setNotice(`Removed ${getMemberName(member)} from the team.`);
    } catch (removeError) {
      setError(getErrorMessage(removeError, "Failed to remove member."));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleCopyInvite(invite: TeamInvite) {
    setCopyingInviteId(invite.id);
    setError(null);

    try {
      await navigator.clipboard.writeText(invite.invite_url);
      setNotice(`Copied invite link for ${invite.email}.`);
    } catch (copyError) {
      setError(getErrorMessage(copyError, "Failed to copy invite link."));
    } finally {
      setCopyingInviteId(null);
    }
  }

  async function handleResendInvite(invite: TeamInvite) {
    if (!activeTeamId) {
      return;
    }

    setResendingInviteId(invite.id);
    setError(null);

    try {
      const { data } = await apiClient.post<TeamInvite>(
        `/api/teams/${activeTeamId}/invites/${invite.id}/resend/`,
      );
      await reloadTeamDetail();
      setNotice(
        data.delivery_error
          ? `Invite link refreshed for ${invite.email}, but email delivery failed.`
          : `Invite resent to ${invite.email}.`,
      );
    } catch (resendError) {
      setError(getErrorMessage(resendError, "Failed to resend invite."));
    } finally {
      setResendingInviteId(null);
    }
  }

  async function handleRevokeInvite(invite: TeamInvite) {
    if (!activeTeamId) {
      return;
    }

    const confirmed = window.confirm(`Revoke the active invite for ${invite.email}?`);
    if (!confirmed) {
      return;
    }

    setRevokingInviteId(invite.id);
    setError(null);

    try {
      await apiClient.post(`/api/teams/${activeTeamId}/invites/${invite.id}/revoke/`);
      await reloadTeamDetail();
      setNotice(`Invite revoked for ${invite.email}.`);
    } catch (revokeError) {
      setError(getErrorMessage(revokeError, "Failed to revoke invite."));
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function handleSaveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamId || !teamName.trim()) {
      return;
    }

    setIsSavingTeam(true);
    setError(null);

    try {
      const { data } = await apiClient.patch<TeamDetail>(`/api/teams/${activeTeamId}/`, {
        name: teamName.trim(),
      });
      setTeam(data);
      setTeamName(data.name);
      await refreshUser();
      setNotice("Team settings updated.");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Failed to update team settings."));
    } finally {
      setIsSavingTeam(false);
    }
  }

  function openProject(project: TeamProject) {
    setProjectId(project.id);
    navigate("/assets");
  }

  function renderOverviewTab() {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="space-y-6">
          <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.26)]" style={{ borderRadius: "2px" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.08)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-nereus-accent" style={{ borderRadius: "2px" }}>
                  <Building2 className="h-3.5 w-3.5" />
                  Team Workspace
                </div>
                <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-white">{team?.name ?? activeTeam?.name ?? "Team"}</h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[rgba(255,255,255,0.58)]">
                  Manage project access, engineer roles, and invite-driven onboarding from one team-scoped workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex h-10 items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgba(255,255,255,0.62)] transition-colors hover:border-[rgba(0,212,255,0.2)] hover:text-white disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.28)]"
                style={{ borderRadius: "2px" }}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Your Access</div>
                <div className={`mt-3 inline-flex items-center border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${roleBadgeClass(activeTeam?.role)}`} style={{ borderRadius: "2px" }}>
                  {formatRoleLabel(activeTeam?.role)}
                </div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Projects</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{team?.project_count ?? activeTeam?.project_count ?? 0}</div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Members</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{team?.member_count ?? activeTeam?.member_count ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white">
                  <FolderPlus className="h-4 w-4 text-nereus-accent" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Projects</span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white">Team project lanes</h2>
              </div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.36)]">
                {canEditProjects ? "Engineers and admins can create new projects" : "Read-only project access"}
              </div>
            </div>

            {canEditProjects && (
              <form className="mt-6 grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]" onSubmit={handleCreateProject}>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Project name"
                  className="h-11 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[13px] text-white outline-none placeholder:text-[rgba(255,255,255,0.3)]"
                  style={{ borderRadius: "2px" }}
                />
                <input
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Project description"
                  className="h-11 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[13px] text-white outline-none placeholder:text-[rgba(255,255,255,0.3)]"
                  style={{ borderRadius: "2px" }}
                />
                <button
                  type="submit"
                  disabled={isCreatingProject || !projectName.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                  style={{ borderRadius: "2px" }}
                >
                  <Plus className="h-4 w-4" />
                  {isCreatingProject ? "Creating..." : "Create"}
                </button>
              </form>
            )}

            <div className="mt-6 grid gap-3">
              {sortedProjects.length === 0 ? (
                <div className="border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-8 text-center text-[13px] text-[rgba(255,255,255,0.48)]" style={{ borderRadius: "2px" }}>
                  No projects are attached to this team yet.
                </div>
              ) : (
                sortedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex flex-col gap-4 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 lg:flex-row lg:items-center lg:justify-between"
                    style={{ borderRadius: "2px" }}
                  >
                    <div>
                      <div className="text-[15px] font-medium text-white">{project.name}</div>
                      <div className="mt-1 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">
                        {project.description?.trim() || "No project description yet."}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-[rgba(255,255,255,0.34)]">
                        Updated {formatDateTime(project.updated_at)}
                      </div>
                      <button
                        type="button"
                        onClick={() => openProject(project)}
                        className="inline-flex h-9 items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(0,212,255,0.08)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nereus-accent transition-colors hover:border-[rgba(0,212,255,0.26)] hover:bg-[rgba(0,212,255,0.12)]"
                        style={{ borderRadius: "2px" }}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        Open
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
            <div className="flex items-center gap-2 text-white">
              <Shield className="h-4 w-4 text-nereus-accent" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Access Model</span>
            </div>
            <div className="mt-4 space-y-3 text-[13px] leading-6 text-[rgba(255,255,255,0.58)]">
              <div>Viewers can inspect projects, members, and workspace context.</div>
              <div>Engineers can create and edit team-scoped projects.</div>
              <div>Team admins can invite members, adjust roles, and rename the workspace.</div>
            </div>
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-white">
                  <Mail className="h-4 w-4 text-nereus-accent" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Invite Pipeline</span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-white">Recent activity</h3>
              </div>
              <div className="text-[28px] font-semibold tracking-[-0.04em] text-white">{pendingInviteCount}</div>
            </div>

            <div className="mt-5 grid gap-3">
              {recentActivity.length === 0 ? (
                <div className="text-[13px] text-[rgba(255,255,255,0.48)]">Activity will appear here as projects and invites move.</div>
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3" style={{ borderRadius: "2px" }}>
                    <div className="text-[13px] font-medium text-white">{item.label}</div>
                    <div className="mt-1 text-[12px] text-[rgba(255,255,255,0.45)]">{item.meta}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-[rgba(255,255,255,0.3)]">{formatDateTime(item.timestamp)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  function renderMembersTab() {
    return (
      <div className="space-y-6">
        <section className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Users className="h-4 w-4 text-nereus-accent" />
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Members</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white">Role-aware team roster</h2>
            </div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.36)]">
              {canManageTeam ? "Admins can update roles and remove access" : "Read-only member visibility"}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {sortedMembers.map((member) => {
              const isCurrentUser = member.id === user?.id;
              const isBusy = updatingMemberId === member.id || removingMemberId === member.id;

              return (
                <div
                  key={member.id}
                  className="grid gap-4 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr] xl:items-center"
                  style={{ borderRadius: "2px" }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-[15px] font-medium text-white">{getMemberName(member)}</div>
                      {isCurrentUser && (
                        <span className="border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.08)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-nereus-accent" style={{ borderRadius: "2px" }}>
                          You
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[13px] text-[rgba(255,255,255,0.55)]">{member.email || member.username}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-[rgba(255,255,255,0.32)]">Joined {formatDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${roleBadgeClass(member.role)}`} style={{ borderRadius: "2px" }}>
                      {formatRoleLabel(member.role)}
                    </span>
                    {canManageTeam && (
                      <select
                        value={roleDrafts[member.id] ?? member.role}
                        onChange={(event) => handleMemberRoleChange(member, event.target.value as TeamRole)}
                        disabled={isBusy}
                        className="h-9 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[12px] text-white outline-none disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.32)]"
                        style={{ borderRadius: "2px" }}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {formatRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex justify-start xl:justify-end">
                    {canManageTeam ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        disabled={isBusy}
                        className="inline-flex h-9 items-center gap-2 border border-[rgba(255,107,53,0.22)] bg-[rgba(255,107,53,0.08)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nereus-orange transition-colors hover:border-[rgba(255,107,53,0.34)] hover:bg-[rgba(255,107,53,0.12)] disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.32)]"
                        style={{ borderRadius: "2px" }}
                      >
                        <UserMinus className="h-4 w-4" />
                        {removingMemberId === member.id ? "Removing..." : "Remove"}
                      </button>
                    ) : (
                      <div className="text-[12px] text-[rgba(255,255,255,0.4)]">Only team admins can change roster access.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  function renderInvitesTab() {
    return (
      <div className="space-y-6">
        <section className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Mail className="h-4 w-4 text-nereus-accent" />
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Invites</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white">Magic-link access control</h2>
            </div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.36)]">{pendingInviteCount} pending</div>
          </div>

          {canManageTeam ? (
            <form className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_0.7fr_auto]" onSubmit={handleCreateInvite}>
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="engineer@company.com"
                className="h-11 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[13px] text-white outline-none placeholder:text-[rgba(255,255,255,0.3)]"
                style={{ borderRadius: "2px" }}
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                className="h-11 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[13px] text-white outline-none"
                style={{ borderRadius: "2px" }}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {formatRoleLabel(role)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isCreatingInvite || !inviteEmail.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                style={{ borderRadius: "2px" }}
              >
                <Plus className="h-4 w-4" />
                {isCreatingInvite ? "Sending..." : "Send invite"}
              </button>
            </form>
          ) : (
            <div className="mt-6 border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-[13px] text-[rgba(255,255,255,0.48)]" style={{ borderRadius: "2px" }}>
              Only team admins can issue or resend invites.
            </div>
          )}

          <div className="mt-6 grid gap-3">
            {sortedInvites.length === 0 ? (
              <div className="border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-8 text-center text-[13px] text-[rgba(255,255,255,0.48)]" style={{ borderRadius: "2px" }}>
                No invites have been issued for this team yet.
              </div>
            ) : (
              sortedInvites.map((invite) => {
                const canResend = invite.status === "pending" || invite.status === "expired";
                const canRevoke = invite.status === "pending";
                const isBusy = resendingInviteId === invite.id || revokingInviteId === invite.id || copyingInviteId === invite.id;

                return (
                  <div
                    key={invite.id}
                    className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4"
                    style={{ borderRadius: "2px" }}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[15px] font-medium text-white">{invite.email}</div>
                          <span className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${inviteStatusClass(invite.status)}`} style={{ borderRadius: "2px" }}>
                            {formatInviteStatus(invite.status)}
                          </span>
                          <span className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${roleBadgeClass(invite.role)}`} style={{ borderRadius: "2px" }}>
                            {formatRoleLabel(invite.role)}
                          </span>
                        </div>
                        <div className="mt-2 text-[12px] leading-6 text-[rgba(255,255,255,0.5)]">
                          Invited by {invite.invited_by_name || "Nereus"} · expires {formatDateTime(invite.expires_at)} · sent {invite.send_count} {invite.send_count === 1 ? "time" : "times"}
                        </div>
                        {invite.delivery_error && (
                          <div className="mt-3 border border-[rgba(255,184,77,0.24)] bg-[rgba(255,184,77,0.08)] px-3 py-2 text-[12px] text-amber-300" style={{ borderRadius: "2px" }}>
                            Email delivery failed: {invite.delivery_error}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => handleCopyInvite(invite)}
                          disabled={isBusy}
                          className="inline-flex h-9 items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(255,255,255,0.62)] transition-colors hover:border-[rgba(0,212,255,0.2)] hover:text-white disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.3)]"
                          style={{ borderRadius: "2px" }}
                        >
                          <Link2 className="h-4 w-4" />
                          {copyingInviteId === invite.id ? "Copying..." : "Copy link"}
                        </button>

                        {canManageTeam && canResend && (
                          <button
                            type="button"
                            onClick={() => handleResendInvite(invite)}
                            disabled={isBusy}
                            className="inline-flex h-9 items-center gap-2 border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.08)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nereus-accent transition-colors hover:border-[rgba(0,212,255,0.32)] hover:bg-[rgba(0,212,255,0.12)] disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.3)]"
                            style={{ borderRadius: "2px" }}
                          >
                            <RefreshCw className={`h-4 w-4 ${resendingInviteId === invite.id ? "animate-spin" : ""}`} />
                            {resendingInviteId === invite.id ? "Resending..." : "Resend"}
                          </button>
                        )}

                        {canManageTeam && canRevoke && (
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(invite)}
                            disabled={isBusy}
                            className="inline-flex h-9 items-center gap-2 border border-[rgba(255,107,53,0.22)] bg-[rgba(255,107,53,0.08)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nereus-orange transition-colors hover:border-[rgba(255,107,53,0.34)] hover:bg-[rgba(255,107,53,0.12)] disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.3)]"
                            style={{ borderRadius: "2px" }}
                          >
                            <Trash2 className="h-4 w-4" />
                            {revokingInviteId === invite.id ? "Revoking..." : "Revoke"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderSettingsTab() {
    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
          <div className="flex items-center gap-2 text-white">
            <Settings2 className="h-4 w-4 text-nereus-accent" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Settings</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white">Workspace identity</h2>
          <p className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">
            Rename the team workspace without affecting project content or membership assignments.
          </p>

          {canManageTeam ? (
            <form className="mt-6 space-y-4" onSubmit={handleSaveTeam}>
              <div>
                <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)]" htmlFor="team-name-input">
                  Team name
                </label>
                <input
                  id="team-name-input"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  className="h-11 w-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[13px] text-white outline-none"
                  style={{ borderRadius: "2px" }}
                />
              </div>
              <button
                type="submit"
                disabled={isSavingTeam || !teamName.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                style={{ borderRadius: "2px" }}
              >
                <Settings2 className="h-4 w-4" />
                {isSavingTeam ? "Saving..." : "Save settings"}
              </button>
            </form>
          ) : (
            <div className="mt-6 border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-[13px] text-[rgba(255,255,255,0.48)]" style={{ borderRadius: "2px" }}>
              Only team admins can change workspace settings.
            </div>
          )}
        </section>

        <section className="border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,15,0.7)] p-6" style={{ borderRadius: "2px" }}>
          <div className="flex items-center gap-2 text-white">
            <Shield className="h-4 w-4 text-nereus-accent" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Role guide</span>
          </div>
          <div className="mt-5 grid gap-3">
            <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
              <div className="text-[14px] font-medium text-white">Viewer</div>
              <div className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">Read-only access to projects, team roster, and simulation context.</div>
            </div>
            <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
              <div className="text-[14px] font-medium text-white">Engineer</div>
              <div className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">Can create and modify team-scoped projects, but cannot manage roster or invites.</div>
            </div>
            <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
              <div className="text-[14px] font-medium text-white">Team Admin</div>
              <div className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.55)]">Controls the roster, invite lifecycle, and workspace settings.</div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderActiveTab() {
    if (activeTab === "members") {
      return renderMembersTab();
    }

    if (activeTab === "invites") {
      return renderInvitesTab();
    }

    if (activeTab === "settings") {
      return renderSettingsTab();
    }

    return renderOverviewTab();
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#090b10_0%,#09111b_100%)]">
        <div
          className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
          style={{ borderRadius: "2px" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.12),transparent_26%),linear-gradient(180deg,#090b10_0%,#09111b_100%)] px-6 py-8 text-[rgba(255,255,255,0.9)] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.38)]">Team Operations</div>
            <div className="mt-2 text-[14px] leading-6 text-[rgba(255,255,255,0.55)]">
              Team-aware project control, RBAC, and invite-based onboarding.
            </div>
          </div>

          {team && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${roleBadgeClass(team.role)}`} style={{ borderRadius: "2px" }}>
                {formatRoleLabel(team.role)}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex h-9 items-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(255,255,255,0.62)] transition-colors hover:border-[rgba(0,212,255,0.2)] hover:text-white disabled:cursor-not-allowed disabled:text-[rgba(255,255,255,0.3)]"
                style={{ borderRadius: "2px" }}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          )}
        </div>

        {notice && (
          <div className="mb-4 border border-[rgba(0,212,255,0.22)] bg-[rgba(0,212,255,0.08)] px-4 py-3 text-[12px] text-nereus-accent" style={{ borderRadius: "2px" }}>
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.08)] px-4 py-3 text-[12px] text-nereus-orange" style={{ borderRadius: "2px" }}>
            {error}
          </div>
        )}

        {!team ? (
          <div className="border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-6 py-12 text-center text-[13px] text-[rgba(255,255,255,0.48)]" style={{ borderRadius: "2px" }}>
            Unable to load team data for the current selection.
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {teamTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex h-10 items-center gap-2 border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    activeTab === tab.id
                      ? "border-[rgba(0,212,255,0.22)] bg-[rgba(0,212,255,0.08)] text-nereus-accent"
                      : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.5)] hover:text-white"
                  }`}
                  style={{ borderRadius: "2px" }}
                >
                  {tab.label}
                  {tab.id === "members" && <span className="text-[10px] text-[rgba(255,255,255,0.45)]">{team.member_count}</span>}
                  {tab.id === "invites" && <span className="text-[10px] text-[rgba(255,255,255,0.45)]">{pendingInviteCount}</span>}
                </button>
              ))}
            </div>

            {renderActiveTab()}
          </>
        )}
      </div>
    </div>
  );
}