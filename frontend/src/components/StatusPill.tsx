import { type ReactNode } from "react";
import { Circle, Loader2, CheckCircle2, XCircle } from "lucide-react";

export type StatusType =
  | "IDLE"
  | "PENDING"
  | "MESHING"
  | "SOLVING"
  | "COMPLETED"
  | "FAILED";

interface StatusPillProps {
  status: StatusType;
}

const statusConfig: Record<StatusType, {
  icon: ReactNode;
  color: string;
  label: string;
  subtext: string;
  animate: boolean;
}> = {
  IDLE: {
    icon: <Circle className="h-2 w-2" />, // unfilled
    color: "text-slate-500",
    label: "Idle",
    subtext: "Ready to run",
    animate: false,
  },
  PENDING: {
    icon: <Loader2 className="h-2 w-2" />,
    color: "text-accent-cyan",
    label: "Pending",
    subtext: "Waiting for queue",
    animate: true,
  },
  MESHING: {
    icon: <Loader2 className="h-2 w-2" />, 
    color: "text-accent-cyan",
    label: "Meshing",
    subtext: "Preparing mesh",
    animate: true,
  },
  SOLVING: {
    icon: <Loader2 className="h-2 w-2" />, 
    color: "text-accent-cyan",
    label: "Solving",
    subtext: "Computing simulation",
    animate: true,
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-2 w-2 fill-current" />, 
    color: "text-accent-emerald",
    label: "Completed",
    subtext: "Done",
    animate: false,
  },
  FAILED: {
    icon: <XCircle className="h-2 w-2 fill-current" />,
    color: "text-accent-rose",
    label: "Failed",
    subtext: "Needs review",
    animate: false,
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-2 w-2 items-center justify-center ${config.color} ${
          config.animate ? "animate-spin animate-pulse-glow" : ""
        }`}
        aria-hidden="true"
      >
        {config.icon}
      </span>

      <div className="flex flex-col leading-tight">
        <span className="text-xs font-medium text-slate-100">{config.label}</span>
        <span className="text-2xs text-slate-400">{config.subtext}</span>
      </div>
    </div>
  );
}
