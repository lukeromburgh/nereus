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
    icon: <Circle className="h-1.5 w-1.5" />,
    color: "text-[rgba(255,255,255,0.3)]",
    label: "Idle",
  },
  PENDING: {
    icon: <Loader2 className="h-1.5 w-1.5 animate-spin" />,
    color: "text-nereus-accent",
    label: "Pending",
  },
  MESHING: {
    icon: <Loader2 className="h-1.5 w-1.5 animate-spin" />,
    color: "text-nereus-accent",
    label: "Meshing",
  },
  SOLVING: {
    icon: <Loader2 className="h-1.5 w-1.5 animate-spin" />,
    color: "text-nereus-accent",
    label: "Solving",
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-1.5 w-1.5" />,
    color: "text-nereus-accent",
    label: "Complete",
  },
  FAILED: {
    icon: <AlertCircle className="h-1.5 w-1.5" />,
    color: "text-nereus-orange",
    label: "Failed",
  },
};

export function StatusBadge({ runId, status, timeLine }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.IDLE;

  return (
    <div className="pointer-events-none absolute left-2.5 top-2.5 z-10">
      <div className="bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] p-2.5 space-y-1.5" style={{ borderRadius: '2px' }}>
        {/* Run ID */}
        <div className="text-[10px] text-[rgba(255,255,255,0.35)] font-mono">
          Run {runId ? `#${runId.slice(0, 6)}` : "—"}
        </div>

        {/* Status line with icon */}
        <div className="flex items-center gap-1.5">
          <div className={config.color}>{config.icon}</div>
          <span className="text-[11px] font-medium text-[rgba(255,255,255,0.7)]">
            {config.label}
          </span>
        </div>

        {/* Time line (if running) */}
        {timeLine && (
          <div className="text-[10px] text-[rgba(255,255,255,0.35)] font-mono pt-1 border-t border-[rgba(255,255,255,0.06)]">
            {timeLine}
          </div>
        )}
      </div>
    </div>
  );
}