/**
 * StatusBadge — Minimal run status display for VTK viewport.
 *
 * Shows run ID, status with icon, and simulation time.
 * Replaces the verbose text-based badge.
 */
import { Circle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type RunStatus = "IDLE" | "PENDING" | "MESHING" | "SOLVING" | "COMPLETED" | "FAILED";

interface StatusBadgeProps {
  runId: string | null;
  status: RunStatus;
  timeLine: string | null;
}

const statusConfig: Record<RunStatus, { icon: React.ReactNode; color: string; label: string }> = {
  IDLE: {
    icon: <Circle className="h-2 w-2" />,
    color: "text-slate-500",
    label: "Idle",
  },
  PENDING: {
    icon: <Loader2 className="h-2 w-2 animate-spin" />,
    color: "text-accent-glow",
    label: "Pending",
  },
  MESHING: {
    icon: <Loader2 className="h-2 w-2 animate-spin" />,
    color: "text-accent-glow",
    label: "Meshing",
  },
  SOLVING: {
    icon: <Loader2 className="h-2 w-2 animate-spin" />,
    color: "text-accent-glow",
    label: "Solving",
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-2 w-2" />,
    color: "text-accent-emerald",
    label: "Complete",
  },
  FAILED: {
    icon: <AlertCircle className="h-2 w-2" />,
    color: "text-accent-rose",
    label: "Failed",
  },
};

export function StatusBadge({ runId, status, timeLine }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.IDLE;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10">
      <div className="glass-panel-refined rounded-lg p-3 space-y-2">
        {/* Run ID */}
        <div className="text-2xs text-slate-500 font-mono">
          Run {runId ? `#${runId.slice(0, 6)}` : "—"}
        </div>

        {/* Status line with icon */}
        <div className="flex items-center gap-2">
          <div className={config.color}>{config.icon}</div>
          <span className="text-xs font-medium text-slate-200">
            {config.label}
          </span>
        </div>

        {/* Time line (if running) */}
        {timeLine && (
          <div className="text-2xs text-slate-500 font-mono pt-1 border-t border-hud-border/30">
            {timeLine}
          </div>
        )}
      </div>
    </div>
  );
}