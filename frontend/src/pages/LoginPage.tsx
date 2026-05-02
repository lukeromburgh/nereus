import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, ShieldCheck, Waves } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isAxiosError } from "../lib/apiClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const destination = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname || "/";
  }, [location.state]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-nereus-base">
        <div
          className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
          style={{ borderRadius: "2px" }}
        />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ username, password });
      navigate(destination, { replace: true });
    } catch (submitError) {
      if (isAxiosError(submitError)) {
        const detail = (submitError.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || submitError.message || "Sign-in failed.");
      } else if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError("Sign-in failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090b10] text-[rgba(255,255,255,0.9)]">
      <div className="grid min-h-screen lg:grid-cols-[1.2fr_0.8fr]">
        <section className="relative hidden overflow-hidden border-r border-[rgba(255,255,255,0.06)] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.18),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(180deg,#0a0d12_0%,#0b1220_100%)]" />
          <div className="absolute inset-y-0 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(0,212,255,0.4),transparent)]" />
          <div className="relative flex h-full flex-col justify-between p-10">
            <div>
              <div className="inline-flex items-center gap-2 border border-[rgba(0,212,255,0.18)] bg-[rgba(0,212,255,0.08)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-nereus-accent" style={{ borderRadius: "2px" }}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Session Auth Enabled
              </div>
              <div className="mt-6 flex items-center gap-3">
                <Waves className="h-7 w-7 text-nereus-accent" />
                <div>
                  <div className="text-[12px] font-mono uppercase tracking-[0.24em] text-[rgba(255,255,255,0.42)]">Nereus</div>
                  <h1 className="mt-2 max-w-md text-4xl font-semibold tracking-[-0.03em] text-white">
                    Protected hydrofoil simulation workspace.
                  </h1>
                </div>
              </div>
              <p className="mt-6 max-w-lg text-[15px] leading-7 text-[rgba(255,255,255,0.62)]">
                Sign in with a Django user account to access projects, assets, and solver runs through a session-backed API.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Boundary</div>
                <div className="mt-2 text-[13px] text-white">DRF session authentication</div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Transport</div>
                <div className="mt-2 text-[13px] text-white">Cookie + CSRF protection</div>
              </div>
              <div className="border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4" style={{ borderRadius: "2px" }}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Next</div>
                <div className="mt-2 text-[13px] text-white">Team scoping in Phase 1.2</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl" style={{ borderRadius: "2px" }}>
            <div className="flex items-center gap-2 text-nereus-accent">
              <LockKeyhole className="h-4 w-4" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em]">Account Access</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-white">Sign in</h2>
            <p className="mt-2 text-[13px] leading-6 text-[rgba(255,255,255,0.52)]">
              Use an existing Django user account. If you have not created one yet, create it via Django admin or `createsuperuser`.
            </p>

            <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.22)] focus:border-[rgba(0,212,255,0.45)]"
                  style={{ borderRadius: "2px" }}
                  placeholder="engineer"
                  required
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.42)]">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,17,0.92)] px-3 text-[14px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.22)] focus:border-[rgba(0,212,255,0.45)]"
                  style={{ borderRadius: "2px" }}
                  placeholder="••••••••"
                  required
                />
              </label>

              {error && (
                <div className="border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.08)] px-3 py-2 text-[12px] text-nereus-orange" style={{ borderRadius: "2px" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 inline-flex h-11 items-center justify-center bg-[#00d4ff] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#081018] transition-colors hover:bg-[#2cdbff] disabled:cursor-not-allowed disabled:bg-[rgba(255,255,255,0.12)] disabled:text-[rgba(255,255,255,0.34)]"
                style={{ borderRadius: "2px" }}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}