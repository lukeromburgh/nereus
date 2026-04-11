/**
 * CompactMetric — Minimal, reusable metric value display component.
 *
 * Displays a metric with label, value, and optional unit.
 * No background, no borders, no animations — just clean data presentation.
 */
import type { ReactNode } from "react";

type MetricSize = "sm" | "md" | "lg";

interface CompactMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string; // Tailwind color class, e.g. "text-nereus-accent"
  size?: MetricSize;
  icon?: ReactNode; // Optional icon to display above label
}

export function CompactMetric({
  label,
  value,
  unit,
  color = "text-[rgba(255,255,255,0.7)]",
  size = "md",
  icon,
}: CompactMetricProps) {
  const sizeClasses = {
    sm: "text-[11px]",
    md: "text-[12px]",
    lg: "text-[16px]",
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      {icon && <div className="text-[rgba(255,255,255,0.3)]">{icon}</div>}
      
      <div className="text-[10px] text-[rgba(255,255,255,0.35)] font-normal">{label}</div>
      
      <div className="flex items-baseline gap-0.5">
        <span
          className={`${sizeClasses[size]} font-mono tabular-nums font-medium ${color}`}
        >
          {value}
        </span>
        {unit && <span className="text-[10px] text-[rgba(255,255,255,0.25)]">{unit}</span>}
      </div>
    </div>
  );
}