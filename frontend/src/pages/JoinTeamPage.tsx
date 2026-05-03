import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Link2, Shield, UserPlus, Users } from "lucide-react";
import apiClient, { isAxiosError } from "../lib/apiClient";
import { useAuth, type TeamRole } from "../lib/auth";

type InvitePreview = {
  id: number;
  email: string;
  role: TeamRole;
  status: string;
  expires_at: string;
  existing_account: boolean;
  team: {
    id: number;
    name: string;
  };
};

function formatRole(role: TeamRole) {
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

export default function JoinTeamPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useParams<{ token: string }>();
  const { user, isAuthenticated, isLoading, refreshUser, setActiveTeamId } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      if (!token) {
        if (active) {
          setError("Invite token is missing.");
          setIsPreviewLoading(false);
        }
        return;
      }

      setIsPreviewLoading(true);
      setError(null);

      try {
        const { data } = await apiClient.get<InvitePreview>(`/api/team-invites/${token}/`);
        if (!active) return;
        setInvite(data);
      } catch (previewError) {
        if (!active) return;
        setError(getErrorMessage(previewError, "Failed to load this invite."));
        setInvite(null);
      } finally {
        if (active) {
          setIsPreviewLoading(false);
        }
      }
    }

    loadInvite();
    return () => {
      active = false;
    };
  }, [token]);

  const identityStatus = useMemo(() => {
    if (!invite || !user || user.is_superuser) {
      return null;
    }

    const inviteEmail = invite.email.trim().toLowerCase();
    const userEmail = (user.email || "").trim().toLowerCase();

    if (!userEmail) {
      return "Your current account does not have an email address, so it cannot claim this invite yet.";
    }

    if (userEmail !== inviteEmail) {
      return `This invite was issued for ${invite.email}, but you are signed in as ${user.email || user.username}.`;
    }

    return null;
  }, [invite, user]);

  async function handleAcceptInvite() {
    if (!token || !invite) return;

    setIsAccepting(true);
    setError(null);

    try {
      const { data } = await apiClient.post<{ detail: string; team: { id: number } }>(`/api/team-invites/${token}/accept/`);
      await refreshUser();
      setActiveTeamId(data.team.id);
      navigate("/team", { replace: true });
    } catch (acceptError) {
      setError(getErrorMessage(acceptError, "Failed to accept this invite."));
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !invite) return;

    setIsSigningUp(true);
    setError(null);

    try {
      const { data } = await apiClient.post<{ detail: string; team: { id: number } }>(`/api/team-invites/${token}/signup/`, {
        first_name: firstName,
        last_name: lastName,
        password,
        password_confirm: passwordConfirm,
      });
      await refreshUser();
      setActiveTeamId(data.team.id);
      navigate("/team", { replace: true });
    } catch (signupError) {
      setError(getErrorMessage(signupError, "Failed to create the invited account."));
    } finally {
      setIsSigningUp(false);
    }
  }

  function handleLoginRedirect() {
    navigate("/login", {
      replace: true,
      state: { from: { pathname: location.pathname } },
    });
  }

  if (isPreviewLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b10]">
        <div
          className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
          style={{ borderRadius: "2px" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.14),transparent_28%),linear-gradient(180deg,#090b10_0%,#09111b_100%)] px-6 py-10 text-[rgba(255,255,255,0.9)] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_24px_90px_rgba(0,0,0,0.34)] lg:grid-cols-[1.1fr_0.9fr]" style={{ borderRadius: "2px" }}>
          <section className="border-b border-[rgba(255,255,255,0.06)] p-8 lg:border-b-0 lg:border-r">
            <div className="inline-flex items-center gap-2 border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.08)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-nereus-accent" style={{ borderRadius: "2px" }}>
              <Link2 className="h-3.5 w-3.5" />
              Magic Link Invite
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-white">
              Join {invite?.team.name ?? "Team workspace"}
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-7 text-[rgba(255,255,255,0.6)]">
              This invite links one account and one email address to a team-scoped simulation workspace.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Role</div>
                <div className="mt-2 text-[14px] text-white">{invite ? formatRole(invite.role) : "Unknown"}</div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Issued For</div>
                <div className="mt-2 text-[14px] text-white">{invite?.email ?? "Unknown"}</div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Expires</div>
                <div className="mt-2 text-[14px] text-white">{invite ? formatDate(invite.expires_at) : "Unknown"}</div>
              </div>
            </div>
          </section>

          <section className="p-8">
            <div className="flex items-center gap-2 text-white">
              <Users className="h-4 w-4 text-nereus-accent" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[rgba(255,255,255,0.48)]">Workspace Access</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-white">Accept team invite</h2>
            <p className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]">
              Sign in with the invited email, or create the invited account here and join the workspace in one step.
            </p>

            {error && (
              <div className="mt-5 border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.08)] px-3 py-2 text-[12px] text-nereus-orange" style={{ borderRadius: "2px" }}>
                {error}
              </div>
            )}

            {invite && invite.status !== "pending" && (
              <div className="mt-5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[rgba(255,255,255,0.58)]" style={{ borderRadius: "2px" }}>
                This invite is {invite.status}. Ask a team admin for a new magic link if you still need access.
              </div>
            )}

            {isAuthenticated ? (
              <div className="mt-6 space-y-4">
                <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.38)]">
                    <Shield className="h-3.5 w-3.5 text-nereus-accent" />
                    Signed in account
                  </div>
                  <div className="mt-3 text-[15px] font-medium text-white">{user?.email || user?.username}</div>
                </div>

                {identityStatus && (
                  <div className="border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.08)] px-4 py-3 text-[12px] text-nereus-orange" style={{ borderRadius: "2px" }}>
                    {identityStatus}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAcceptInvite}
                  disabled={!invite || invite.status !== "pending" || Boolean(identityStatus) || isAccepting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                  style={{ borderRadius: "2px" }}
                >
                  <ArrowRight className="h-4 w-4" />
                  {isAccepting ? "Joining..." : "Accept Invite"}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {invite?.existing_account ? (
                  <>
                    <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 text-[13px] leading-6 text-[rgba(255,255,255,0.58)]" style={{ borderRadius: "2px" }}>
                      An account already exists for {invite.email}. Sign in and the app will bring you back to this invite automatically.
                    </div>
                    <button
                      type="button"
                      onClick={handleLoginRedirect}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff]"
                      style={{ borderRadius: "2px" }}
                    >
                      <ArrowRight className="h-4 w-4" />
                      Sign In To Continue
                    </button>
                  </>
                ) : (
                  <>
                    <form className="space-y-4" onSubmit={handleCreateAccount}>
                      <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 text-[13px] leading-6 text-[rgba(255,255,255,0.58)]" style={{ borderRadius: "2px" }}>
                        This invite email does not have an account yet. Create it now and the invite will be accepted automatically. Your invited email becomes your username for later sign-ins.
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">First Name</span>
                          <input
                            type="text"
                            value={firstName}
                            onChange={(event) => setFirstName(event.target.value)}
                            className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                            style={{ borderRadius: "2px" }}
                            placeholder="Avery"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">Last Name</span>
                          <input
                            type="text"
                            value={lastName}
                            onChange={(event) => setLastName(event.target.value)}
                            className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                            style={{ borderRadius: "2px" }}
                            placeholder="Morgan"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">Password</span>
                        <input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                          style={{ borderRadius: "2px" }}
                          placeholder="At least 8 characters"
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">Confirm Password</span>
                        <input
                          type="password"
                          value={passwordConfirm}
                          onChange={(event) => setPasswordConfirm(event.target.value)}
                          className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none focus:border-[rgba(0,212,255,0.45)]"
                          style={{ borderRadius: "2px" }}
                          placeholder="Repeat your password"
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!invite || invite.status !== "pending" || isSigningUp || password.length === 0 || passwordConfirm.length === 0}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                        style={{ borderRadius: "2px" }}
                      >
                        <UserPlus className="h-4 w-4" />
                        {isSigningUp ? "Creating Account..." : "Create Account And Join"}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={handleLoginRedirect}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:border-[rgba(0,212,255,0.3)] hover:text-nereus-accent"
                      style={{ borderRadius: "2px" }}
                    >
                      <ArrowRight className="h-4 w-4" />
                      I Already Have An Account
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}