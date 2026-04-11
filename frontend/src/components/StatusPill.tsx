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
    icon: <Circle className="h-1.5 w-1.5" />,
    color: "text-[rgba(255,255,255,0.35)]",
    label: "Idle",
    subtext: "Ready to run",
    animate: false,
  },
  PENDING: {
    icon: <Loader2 className="h-1.5 w-1.5" />,
    color: "text-nereus-accent",
    label: "Pending",
    subtext: "Waiting for queue",
    animate: true,
  },
  MESHING: {
    icon: <Loader2 className="h-1.5 w-1.5" />, 
    color: "text-nereus-accent",
    label: "Meshing",
    subtext: "Preparing mesh",
    animate: true,
  },
  SOLVING: {
    icon: <Loader2 className="h-1.5 w-1.5" />, 
    color: "text-nereus-accent",
    label: "Solving",
    subtext: "Computing simulation",
    animate: true,
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-1.5 w-1.5 fill-current" />, 
    color: "text-nereus-accent",
    label: "Completed",
    subtext: "Done",
    animate: false,
  },
  FAILED: {
    icon: <XCircle className="h-1.5 w-1.5 fill-current" />,
    color: "text-nereus-orange",
    label: "Failed",
    subtext: "Needs review",
    animate: false,
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex h-1.5 w-1.5 items-center justify-center ${config.color} ${
          config.animate ? "animate-spin" : ""
        }`}
        aria-hidden="true"
      >
        {config.icon}
      </span>

      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium text-white">{config.label}</span>
        <span className="text-[10px] text-[rgba(255,255,255,0.35)]">{config.subtext}</span>
      </div>
    </div>
  );
}
